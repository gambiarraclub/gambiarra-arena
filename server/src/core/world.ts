import type { FastifyBaseLogger } from 'fastify';
import type { EventLogger } from './eventlog.js';
import type {
  Direction,
  PerceptionMessage,
  WorldStateMessage,
  WorldJoinMessage,
  AgentActionMessage,
} from '../ws/schemas.js';

/**
 * Minimal surface of the WebSocketHub that the WorldEngine needs.
 * Declared structurally here to avoid a circular import with hub.ts.
 */
export interface WorldHub {
  broadcastToTelao(message: unknown): void;
  sendToParticipant(participantId: string, message: unknown): boolean;
}

/**
 * Movement model: agents are STATIONARY by default and take a single discrete
 * "hop" only when an action arrives (from the LLM in Phases 2/3, or from the
 * bot brain here in Phase 1). One decision = one visible hop. This keeps the
 * causal link "LLM decided → avatar moved" legible instead of chaotic.
 */
type Phase = 'idle' | 'think' | 'hop';

interface Agent {
  id: string;
  nickname: string;
  emoji: string;
  color: string;
  x: number;
  y: number;
  heading: number; // radians, last move direction (for the heading indicator)
  score: number;
  say: string | null;
  sayUntil: number;
  radarAt: number | null; // epoch ms of last radar pulse (telao animation)
  isBot: boolean;
  pulse: number;

  // hop animation
  hopping: boolean;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  hopStart: number;

  // wall-collision feedback (fed back to the agent on the next radar pulse)
  bumped: boolean; // last hop was blocked by a wall
  stuck: boolean; // last hop barely moved (ran straight into a wall)
  bumpedWalls: string; // e.g. "OESTE" or "OESTE e NORTE"
  bumpedAt: number | null; // epoch ms of last collision (for telao shake/impact fx)

  // bot decision state machine
  phase: Phase;
  phaseUntil: number;
  chosenDir: Direction;

  // real-agent decision pacing
  nextDecisionAt: number;
}

interface Food {
  id: string;
  x: number;
  y: number;
}

export interface WorldConfig {
  width: number;
  height: number;
  foodCount: number;
  eatRadius: number;
  stepDistance: number; // units travelled per hop
  hopDurationMs: number; // animation time of one hop
  botPauseMs: number; // bot: stationary pause between decisions
}

export interface StartParams {
  objective?: string;
  bots?: number;
  foodCount?: number;
  sessionId?: string; // active session to attach high-level world events to
}

const DEFAULT_CONFIG: WorldConfig = {
  width: 1600,
  height: 900,
  foodCount: 14,
  eatRadius: 30,
  stepDistance: 95,
  hopDurationMs: 480,
  botPauseMs: 900,
};

// How long a bot "thinks" (radar shown, still stationary) before hopping.
const BOT_THINK_MS = 450;

// Cadência do registro do estado completo do mundo no event log (ver
// maybeLogSnapshot): 5s equilibra reconstrução suave e volume no SQLite
// (~40 agentes ≈ 5KB/snapshot ≈ 3,6MB/hora).
const WORLD_SNAPSHOT_INTERVAL_MS = 5000;
// Ceiling for a real agent to reply before we re-send perception.
const THINK_CEILING_MS = 12000;

// Compass directions -> heading angle (canvas coords: +y points down/South)
const DIR_ANGLE: Record<Exclude<Direction, 'STAY'>, number> = {
  E: 0,
  SE: Math.PI / 4,
  S: Math.PI / 2,
  SW: (3 * Math.PI) / 4,
  W: Math.PI,
  NW: -(3 * Math.PI) / 4,
  N: -Math.PI / 2,
  NE: -Math.PI / 4,
};

const NEON_PALETTE = [
  '#ff5e5e', '#ffb05e', '#ffe75e', '#7dff5e',
  '#5effd1', '#5eb8ff', '#9d5eff', '#ff5ec4',
  '#5e7dff', '#ff8a5e',
];

const BOT_EMOJIS = ['🤖', '👾', '🐙', '🦊', '🐸', '🐵', '🦄', '🐲', '🐱', '🦉'];
const BOT_NAMES = ['Roboco', 'Zé Bug', 'Pixelino', 'Faísca', 'Glitch', 'Tureta', 'Bibo', 'Caco'];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function angleToCompass(dx: number, dy: number): Direction {
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180
  const idx = Math.round(deg / 45); // -4..4
  const byIdx: Record<number, Direction> = {
    0: 'E', 1: 'SE', 2: 'S', 3: 'SW', 4: 'W',
    [-1]: 'NE', [-2]: 'N', [-3]: 'NW', [-4]: 'W',
  };
  return byIdx[idx] ?? 'E';
}

function distanceBucket(d: number): string {
  if (d < 220) return 'perto';
  if (d < 560) return 'média';
  return 'longe';
}

// easeInOutQuad — gives the hop a little acceleration/deceleration
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class WorldEngine {
  private config: WorldConfig = { ...DEFAULT_CONFIG };
  private agents = new Map<string, Agent>();
  private food: Food[] = [];
  private objective = 'Colete o máximo de comidas que conseguir!';
  private running = false;
  private loop: NodeJS.Timeout | null = null;
  private foodSeq = 0;
  private lastSnapshotAt = 0; // último world_snapshot gravado no event log
  private sessionId?: string; // active session for high-level event logging

  private readonly SIM_INTERVAL_MS = 50; // 20 Hz sim + broadcast

  constructor(
    private hub: WorldHub,
    private logger: FastifyBaseLogger,
    private eventLogger?: EventLogger
  ) {}

  // ---------- lifecycle ----------

  start(params: StartParams = {}) {
    if (params.sessionId) this.sessionId = params.sessionId;
    if (params.objective) this.objective = params.objective;
    if (params.foodCount) this.config.foodCount = params.foodCount;

    this.food = [];
    for (let i = 0; i < this.config.foodCount; i++) this.food.push(this.spawnFood());

    // Remove old bots, keep real (human) agents
    for (const [id, a] of this.agents) {
      if (a.isBot) this.agents.delete(id);
    }

    const botCount = params.bots ?? 0;
    for (let i = 0; i < botCount; i++) {
      const id = `bot-${Date.now()}-${i}`;
      this.agents.set(id, this.makeAgent(id, BOT_NAMES[i % BOT_NAMES.length] + ' ' + (i + 1), true));
    }

    this.running = true;
    this.ensureLoop();

    this.logger.info(
      { objective: this.objective, bots: botCount, food: this.food.length, agents: this.agents.size },
      'WORLD_START: agent world started'
    );
    this.eventLogger?.log({
      sessionId: this.sessionId,
      eventType: 'world_started',
      actorType: 'admin',
      targetType: 'world',
      metadata: { objective: this.objective, foodCount: this.config.foodCount, bots: botCount },
    });
    this.broadcast();
  }

  stop() {
    this.running = false;
    if (this.loop) {
      clearInterval(this.loop);
      this.loop = null;
    }
    // Capture the final leaderboard BEFORE clearing — this is the game's result.
    const scores = Array.from(this.agents.values())
      .map((a) => ({ id: a.id, nickname: a.nickname, score: a.score, isBot: a.isBot }))
      .sort((x, y) => y.score - x.score);
    this.eventLogger?.log({
      sessionId: this.sessionId,
      eventType: 'world_stopped',
      actorType: 'admin',
      targetType: 'world',
      metadata: { objective: this.objective, scores },
    });
    this.agents.clear();
    this.food = [];
    this.logger.info({ scores }, 'WORLD_STOP: agent world stopped');
    this.broadcast();
  }

  isRunning() {
    return this.running;
  }

  private ensureLoop() {
    if (!this.loop) {
      this.loop = setInterval(() => this.tick(), this.SIM_INTERVAL_MS);
    }
  }

  // ---------- agent management ----------

  handleJoin(participantId: string, msg: WorldJoinMessage, info: { nickname: string; sessionId?: string }) {
    if (info.sessionId) this.sessionId = info.sessionId;
    const existing = this.agents.get(participantId);
    if (existing) {
      if (msg.emoji) existing.emoji = msg.emoji;
      if (msg.color) existing.color = msg.color;
      existing.nickname = info.nickname || existing.nickname;
      return;
    }
    const agent = this.makeAgent(participantId, info.nickname || participantId, false);
    if (msg.emoji) agent.emoji = msg.emoji;
    if (msg.color) agent.color = msg.color;
    // Real agents fire their first radar pulse right away.
    agent.nextDecisionAt = Date.now();
    this.agents.set(participantId, agent);
    this.logger.info({ participantId, nickname: agent.nickname }, 'WORLD_JOIN: agent entered world');
    this.eventLogger?.log({
      sessionId: this.sessionId,
      eventType: 'world_joined',
      actorType: 'participant',
      actorId: participantId,
      targetType: 'world',
      metadata: { nickname: agent.nickname, emoji: agent.emoji },
    });

    if (this.food.length === 0) {
      for (let i = 0; i < this.config.foodCount; i++) this.food.push(this.spawnFood());
    }
    this.running = true;
    this.ensureLoop();
  }

  handleAction(participantId: string, msg: AgentActionMessage) {
    const agent = this.agents.get(participantId);
    if (!agent || agent.isBot) return;
    // Ignore actions that arrive mid-hop — one decision, one hop.
    if (agent.hopping) return;

    if (msg.say) {
      agent.say = msg.say.slice(0, 60);
      agent.sayUntil = Date.now() + 4000;
    }

    if (msg.direction === 'STAY') {
      // Stay put, but keep the loop alive: re-pulse shortly.
      agent.nextDecisionAt = Date.now() + 600;
      return;
    }

    this.startHop(agent, msg.direction);
  }

  removeAgent(participantId: string) {
    if (this.agents.delete(participantId)) {
      this.logger.info({ participantId }, 'WORLD_LEAVE: agent removed from world');
    }
  }

  snapshot(): WorldStateMessage {
    return this.buildState();
  }

  // ---------- simulation ----------

  private tick() {
    const now = Date.now();

    for (const agent of this.agents.values()) {
      if (agent.isBot) {
        this.tickBot(agent, now);
      } else {
        this.tickRealAgent(agent, now);
      }

      this.advanceHop(agent, now);
      this.eat(agent, now);

      if (agent.say && now > agent.sayUntil) agent.say = null;
    }

    this.broadcast();
    this.maybeLogSnapshot(now);
  }

  /**
   * Registro periódico do estado COMPLETO do mundo (agentes com posição,
   * direção, placar e fala + comidas) no event log. Do encontro de 23/05 só
   * sobraram os joins/leaves — posições e comidas se perderam e o momento de
   * pico teve que ser reconstruído por aproximação. Com isto, qualquer frame
   * do mundo passa a ser reconstruível pixel a pixel.
   */
  private maybeLogSnapshot(now: number) {
    if (this.agents.size === 0) return;
    if (now - this.lastSnapshotAt < WORLD_SNAPSHOT_INTERVAL_MS) return;
    this.lastSnapshotAt = now;
    const state = this.buildState();
    this.eventLogger?.log({
      sessionId: this.sessionId,
      eventType: 'world_snapshot',
      actorType: 'system',
      targetType: 'world',
      metadata: {
        t: state.t,
        running: state.running,
        objective: state.objective,
        config: state.config,
        agents: state.agents,
        food: state.food,
      },
    });
  }

  /** Bot brain: idle (stationary) → pulse + think → hop → idle. Previews the LLM rhythm. */
  private tickBot(agent: Agent, now: number) {
    if (agent.hopping) return;

    if (agent.phase === 'idle' && now >= agent.phaseUntil) {
      // Decide a direction (toward nearest food, with occasional exploration)
      const nearest = this.nearestFood(agent);
      if (nearest && Math.random() > 0.15) {
        agent.chosenDir = angleToCompass(nearest.x - agent.x, nearest.y - agent.y);
      } else {
        const dirs: Direction[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        agent.chosenDir = dirs[Math.floor(Math.random() * dirs.length)];
      }
      // Radar pulse + thought
      agent.radarAt = now;
      agent.pulse++;
      agent.say = nearest ? `comida a ${agent.chosenDir}!` : `explorando ${agent.chosenDir}...`;
      agent.sayUntil = now + BOT_THINK_MS + 1500;
      agent.phase = 'think';
      agent.phaseUntil = now + BOT_THINK_MS;
    } else if (agent.phase === 'think' && now >= agent.phaseUntil) {
      this.startHop(agent, agent.chosenDir);
      agent.phase = 'hop';
    }
  }

  /** Real (LLM) agent: when idle, send a radar pulse and wait for an action. */
  private tickRealAgent(agent: Agent, now: number) {
    if (agent.hopping) return;
    if (now >= agent.nextDecisionAt) {
      this.sendPerception(agent, now);
      // Ceiling: if the LLM never replies, re-pulse so it isn't stuck forever.
      agent.nextDecisionAt = now + THINK_CEILING_MS;
    }
  }

  private startHop(agent: Agent, dir: Direction) {
    if (dir === 'STAY') return;
    const angle = DIR_ANGLE[dir];
    const step = this.config.stepDistance;
    agent.heading = angle;
    agent.fromX = agent.x;
    agent.fromY = agent.y;

    const rawX = agent.x + Math.cos(angle) * step;
    const rawY = agent.y + Math.sin(angle) * step;
    const toX = Math.max(0, Math.min(this.config.width, rawX));
    const toY = Math.max(0, Math.min(this.config.height, rawY));

    // Which walls blocked the requested move? (the target got clamped)
    const walls: string[] = [];
    if (rawX < 0) walls.push('OESTE');
    else if (rawX > this.config.width) walls.push('LESTE');
    if (rawY < 0) walls.push('NORTE');
    else if (rawY > this.config.height) walls.push('SUL');

    const moved = Math.hypot(toX - agent.x, toY - agent.y);
    agent.bumped = walls.length > 0;
    agent.stuck = walls.length > 0 && moved < step * 0.35; // ran straight into it
    agent.bumpedWalls = walls.join(' e ');
    if (agent.bumped) agent.bumpedAt = Date.now(); // for telao shake/impact fx

    agent.toX = toX;
    agent.toY = toY;
    agent.hopStart = Date.now();
    agent.hopping = true;
  }

  private advanceHop(agent: Agent, now: number) {
    if (!agent.hopping) return;
    const t = (now - agent.hopStart) / this.config.hopDurationMs;
    if (t >= 1) {
      agent.x = agent.toX;
      agent.y = agent.toY;
      agent.hopping = false;
      if (agent.isBot) {
        agent.phase = 'idle';
        agent.phaseUntil = now + this.config.botPauseMs;
      } else {
        // Hop done → ready to perceive + decide again immediately.
        agent.nextDecisionAt = now;
      }
      return;
    }
    const k = ease(t);
    agent.x = agent.fromX + (agent.toX - agent.fromX) * k;
    agent.y = agent.fromY + (agent.toY - agent.fromY) * k;
  }

  private eat(agent: Agent, now: number) {
    for (let i = this.food.length - 1; i >= 0; i--) {
      const f = this.food[i];
      const dx = f.x - agent.x;
      const dy = f.y - agent.y;
      if (dx * dx + dy * dy < this.config.eatRadius * this.config.eatRadius) {
        this.food.splice(i, 1);
        agent.score++;
        agent.say = 'nhom! 🍎';
        agent.sayUntil = now + 1400;
        this.food.push(this.spawnFood());
      }
    }
  }

  private sendPerception(agent: Agent, now: number) {
    agent.radarAt = now;
    agent.pulse++;

    const nearest = this.nearestFood(agent);
    let nearestPayload: PerceptionMessage['nearest_food'] = null;
    let foodPhrase = 'nenhuma comida à vista';
    if (nearest) {
      const dx = nearest.x - agent.x;
      const dy = nearest.y - agent.y;
      const dir = angleToCompass(dx, dy);
      const bucket = distanceBucket(Math.hypot(dx, dy));
      nearestPayload = { direction: dir, distance: bucket };
      foodPhrase = `comida mais próxima a ${dir} (${bucket})`;
    }

    const margins: Array<[string, number]> = [
      ['NORTE', agent.y],
      ['SUL', this.config.height - agent.y],
      ['OESTE', agent.x],
      ['LESTE', this.config.width - agent.x],
    ];
    margins.sort((a, b) => a[1] - b[1]);
    const [wallDir, wallDist] = margins[0];
    const wallPhrase = wallDist < 180 ? `parede a ${wallDir} (${distanceBucket(wallDist)})` : 'sem paredes por perto';

    const ns = agent.y < this.config.height / 3 ? 'norte' : agent.y > (2 * this.config.height) / 3 ? 'sul' : 'centro';
    const ew = agent.x < this.config.width / 3 ? 'oeste' : agent.x > (2 * this.config.width) / 3 ? 'leste' : 'centro';
    const position = ns === ew ? 'centro' : `${ns}-${ew}`;

    // Wall-collision alert: if the last move was blocked, tell the agent loudly
    // and explicitly NOT to keep going that way — this is what un-sticks it.
    let alert = '';
    if (agent.bumped) {
      alert = agent.stuck
        ? `⚠️ VOCÊ BATEU NA PAREDE (${agent.bumpedWalls}) E FICOU PRESO, não saiu do lugar! NÃO vá para ${agent.bumpedWalls} de novo — escolha uma direção para o lado oposto. `
        : `⚠️ você esbarrou na parede (${agent.bumpedWalls}); evite continuar nessa direção. `;
    }

    const radarText = `${alert}RADAR #${agent.pulse}: ${foodPhrase}; ${wallPhrase}; você está no ${position} da arena; comidas coletadas: ${agent.score}.`;

    const msg: PerceptionMessage = {
      type: 'perception',
      pulse: agent.pulse,
      objective: this.objective,
      nearest_food: nearestPayload,
      walls: wallPhrase,
      position,
      score: agent.score,
      bumped: agent.bumped,
      radar_text: radarText,
    };
    this.hub.sendToParticipant(agent.id, msg);

    // Clear the collision flags now that the agent has been told.
    agent.bumped = false;
    agent.stuck = false;
    agent.bumpedWalls = '';
  }

  // ---------- helpers ----------

  private makeAgent(id: string, nickname: string, isBot: boolean): Agent {
    const h = hashStr(id);
    const now = Date.now();
    const x = 80 + Math.random() * (this.config.width - 160);
    const y = 80 + Math.random() * (this.config.height - 160);
    return {
      id,
      nickname,
      emoji: BOT_EMOJIS[h % BOT_EMOJIS.length],
      color: NEON_PALETTE[h % NEON_PALETTE.length],
      x,
      y,
      heading: -Math.PI / 2,
      score: 0,
      say: null,
      sayUntil: 0,
      radarAt: null,
      isBot,
      pulse: 0,
      hopping: false,
      fromX: x,
      fromY: y,
      toX: x,
      toY: y,
      hopStart: 0,
      bumped: false,
      stuck: false,
      bumpedWalls: '',
      bumpedAt: null,
      phase: 'idle',
      phaseUntil: now + Math.random() * this.config.botPauseMs,
      chosenDir: 'N',
      nextDecisionAt: now,
    };
  }

  private spawnFood(): Food {
    const margin = 50;
    return {
      id: `food-${this.foodSeq++}`,
      x: margin + Math.random() * (this.config.width - 2 * margin),
      y: margin + Math.random() * (this.config.height - 2 * margin),
    };
  }

  private nearestFood(agent: Agent): Food | null {
    let best: Food | null = null;
    let bestD = Infinity;
    for (const f of this.food) {
      const dx = f.x - agent.x;
      const dy = f.y - agent.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  private buildState(): WorldStateMessage {
    const now = Date.now();
    return {
      type: 'world_state',
      t: now,
      running: this.running,
      objective: this.objective,
      config: { width: this.config.width, height: this.config.height },
      agents: Array.from(this.agents.values()).map((a) => ({
        id: a.id,
        nickname: a.nickname,
        emoji: a.emoji,
        color: a.color,
        x: Math.round(a.x * 10) / 10,
        y: Math.round(a.y * 10) / 10,
        heading: Math.round(a.heading * 1000) / 1000,
        score: a.score,
        say: a.say && now < a.sayUntil ? a.say : null,
        radarAt: a.radarAt,
        bumpedAt: a.bumpedAt,
        isBot: a.isBot,
      })),
      food: this.food.map((f) => ({ id: f.id, x: Math.round(f.x), y: Math.round(f.y) })),
    };
  }

  private broadcast() {
    this.hub.broadcastToTelao(this.buildState());
  }

  cleanup() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
  }
}
