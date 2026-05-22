import { useEffect, useRef, useState } from 'react';

interface AgentSnapshot {
  id: string;
  nickname: string;
  emoji: string;
  color: string;
  x: number;
  y: number;
  heading: number;
  score: number;
  say: string | null;
  radarAt: number | null;
  bumpedAt: number | null;
  isBot: boolean;
}

interface FoodSnapshot {
  id: string;
  x: number;
  y: number;
}

interface WorldState {
  type: 'world_state';
  t: number;
  running: boolean;
  objective: string;
  config: { width: number; height: number };
  agents: AgentSnapshot[];
  food: FoodSnapshot[];
}

interface BoardEntry {
  id: string;
  nickname: string;
  emoji: string;
  color: string;
  score: number;
}

const RADAR_DURATION_MS = 700;
const RADAR_MAX_RADIUS = 80;
const BUMP_DURATION_MS = 450;

function WorldArena() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Snapshots for interpolation
  const curRef = useRef<WorldState | null>(null);
  const prevRef = useRef<WorldState | null>(null);
  const curAtRef = useRef<number>(0);
  const intervalRef = useRef<number>(60);
  // Per-agent radar animation timing (robust to clock skew)
  const radarSeenRef = useRef<Map<string, { radarAt: number; seenAt: number }>>(new Map());
  // Per-agent wall-collision animation timing
  const bumpSeenRef = useRef<Map<string, { bumpedAt: number; seenAt: number }>>(new Map());

  const rafRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);
  const boardThrottleRef = useRef(0);

  const [wsConnected, setWsConnected] = useState(false);
  const [objective, setObjective] = useState('');
  const [running, setRunning] = useState(false);
  const [board, setBoard] = useState<BoardEntry[]>([]);

  // ---- WebSocket ----
  useEffect(() => {
    mountedRef.current = true;
    const MAX_RECONNECT = 20;

    const updateBoard = (state: WorldState) => {
      const now = performance.now();
      if (now - boardThrottleRef.current < 250) return;
      boardThrottleRef.current = now;
      const entries = state.agents
        .map((a) => ({ id: a.id, nickname: a.nickname, emoji: a.emoji, color: a.color, score: a.score }))
        .sort((x, y) => y.score - x.score);
      setBoard(entries);
      setObjective(state.objective);
      setRunning(state.running);
    };

    const onState = (state: WorldState) => {
      prevRef.current = curRef.current;
      curRef.current = state;
      const now = performance.now();
      if (curAtRef.current > 0) {
        const dt = now - curAtRef.current;
        // Smooth the estimated snapshot interval; clamp to a sane range
        intervalRef.current = Math.max(30, Math.min(200, dt));
      }
      curAtRef.current = now;

      // Track radar pulse + wall-bump arrivals per agent
      const seen = radarSeenRef.current;
      const bumpSeen = bumpSeenRef.current;
      const liveIds = new Set<string>();
      for (const a of state.agents) {
        liveIds.add(a.id);
        if (a.radarAt != null) {
          const prev = seen.get(a.id);
          if (!prev || prev.radarAt !== a.radarAt) {
            seen.set(a.id, { radarAt: a.radarAt, seenAt: now });
          }
        }
        if (a.bumpedAt != null) {
          const prevB = bumpSeen.get(a.id);
          if (!prevB || prevB.bumpedAt !== a.bumpedAt) {
            bumpSeen.set(a.id, { bumpedAt: a.bumpedAt, seenAt: now });
          }
        }
      }
      for (const id of seen.keys()) if (!liveIds.has(id)) seen.delete(id);
      for (const id of bumpSeen.keys()) if (!liveIds.has(id)) bumpSeen.delete(id);

      updateBoard(state);
    };

    const connect = () => {
      if (!mountedRef.current) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${window.location.host}/ws`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: 'telao_register', view: 'world' }));
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'world_state') onState(msg as WorldState);
        } catch {
          /* ignore non-JSON */
        }
      });

      ws.addEventListener('close', () => {
        setWsConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      });
      ws.addEventListener('error', () => {});
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT) return;
      reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * 2 ** (reconnectAttemptsRef.current - 1), 10000);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
    };
  }, []);

  // ---- Render loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let backW = 0;
    let backH = 0;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const cur = curRef.current;
      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;

      // Resize backing store only when needed
      if (backW !== Math.round(cssW * dpr) || backH !== Math.round(cssH * dpr)) {
        backW = Math.round(cssW * dpr);
        backH = Math.round(cssH * dpr);
        canvas.width = backW;
        canvas.height = backH;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      // Background
      ctx.fillStyle = '#0A0E27';
      ctx.fillRect(0, 0, cssW, cssH);

      if (!cur) return;

      const W = cur.config.width;
      const H = cur.config.height;
      const scale = Math.min(cssW / W, cssH / H) * 0.95;
      const offX = (cssW - W * scale) / 2;
      const offY = (cssH - H * scale) / 2;
      const sx = (x: number) => offX + x * scale;
      const sy = (y: number) => offY + y * scale;

      // Arena border + subtle grid
      ctx.strokeStyle = '#252B4D';
      ctx.lineWidth = 2;
      ctx.strokeRect(offX, offY, W * scale, H * scale);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(37,43,77,0.5)';
      const step = 160;
      ctx.beginPath();
      for (let gx = step; gx < W; gx += step) {
        ctx.moveTo(sx(gx), sy(0));
        ctx.lineTo(sx(gx), sy(H));
      }
      for (let gy = step; gy < H; gy += step) {
        ctx.moveTo(sx(0), sy(gy));
        ctx.lineTo(sx(W), sy(gy));
      }
      ctx.stroke();

      // Food
      const tNow = performance.now();
      const pulse = 0.5 + 0.5 * Math.sin(tNow / 300);
      for (const f of cur.food) {
        const fx = sx(f.x);
        const fy = sy(f.y);
        ctx.beginPath();
        ctx.arc(fx, fy, 5 + pulse * 2, 0, Math.PI * 2);
        ctx.fillStyle = '#39FF14';
        ctx.shadowColor = '#39FF14';
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Interpolation factor
      const prev = prevRef.current;
      const alpha = Math.max(0, Math.min(1, (tNow - curAtRef.current) / intervalRef.current));
      const prevById = new Map<string, AgentSnapshot>();
      if (prev) for (const a of prev.agents) prevById.set(a.id, a);

      // Agents
      for (const a of cur.agents) {
        const p = prevById.get(a.id);
        const ix = p ? p.x + (a.x - p.x) * alpha : a.x;
        const iy = p ? p.y + (a.y - p.y) * alpha : a.y;
        let ax = sx(ix);
        let ay = sy(iy);

        // Wall collision: impact burst on the wall side + a decaying shake
        const bump = bumpSeenRef.current.get(a.id);
        if (bump) {
          const bage = tNow - bump.seenAt;
          if (bage < BUMP_DURATION_MS) {
            const bk = bage / BUMP_DURATION_MS;
            const impx = ax + Math.cos(a.heading) * 16;
            const impy = ay + Math.sin(a.heading) * 16;
            ctx.save();
            ctx.globalAlpha = 1 - bk;
            ctx.strokeStyle = '#FF6B35';
            ctx.lineWidth = 3;
            // expanding impact arc facing the wall
            ctx.beginPath();
            ctx.arc(impx, impy, 5 + bk * 20, a.heading - 1.0, a.heading + 1.0);
            ctx.stroke();
            // spark lines bursting from the impact point
            ctx.beginPath();
            for (let s = -1; s <= 1; s++) {
              const sa = a.heading + s * 0.55;
              ctx.moveTo(impx, impy);
              ctx.lineTo(impx + Math.cos(sa) * (8 + bk * 16), impy + Math.sin(sa) * (8 + bk * 16));
            }
            ctx.stroke();
            ctx.restore();
            // decaying shake of the whole avatar
            const mag = (1 - bk) * 6;
            ax += Math.sin(bage / 16) * mag;
            ay += Math.cos(bage / 12) * mag * 0.7;
          }
        }

        // Radar ring
        const seen = radarSeenRef.current.get(a.id);
        if (seen) {
          const age = tNow - seen.seenAt;
          if (age < RADAR_DURATION_MS) {
            const k = age / RADAR_DURATION_MS;
            ctx.beginPath();
            ctx.arc(ax, ay, 16 + k * RADAR_MAX_RADIUS, 0, Math.PI * 2);
            ctx.strokeStyle = a.color;
            ctx.globalAlpha = (1 - k) * 0.6;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }

        // Heading indicator
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + Math.cos(a.heading) * 22, ay + Math.sin(a.heading) * 22);
        ctx.strokeStyle = a.color;
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Body
        ctx.beginPath();
        ctx.arc(ax, ay, 16, 0, Math.PI * 2);
        ctx.fillStyle = a.color;
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = a.color;
        ctx.shadowColor = a.color;
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Emoji
        ctx.font = '20px system-ui, "Apple Color Emoji", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(a.emoji, ax, ay + 1);

        // Name + score
        ctx.font = '600 12px ui-monospace, monospace';
        ctx.fillStyle = '#e8e8e8';
        ctx.fillText(`${a.nickname}  ${a.score}`, ax, ay + 30);

        // Thought bubble
        if (a.say) {
          ctx.font = '13px system-ui, sans-serif';
          const text = a.say;
          const tw = ctx.measureText(text).width;
          const padX = 8;
          const bw = tw + padX * 2;
          const bh = 22;
          const bx = ax - bw / 2;
          const by = ay - 52;
          ctx.fillStyle = 'rgba(26,31,61,0.95)';
          ctx.strokeStyle = a.color;
          ctx.lineWidth = 1.5;
          roundRect(ctx, bx, by, bw, bh, 7);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, ax, by + bh / 2);
        }
      }
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0A0E27]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Disconnected banner */}
      {!wsConnected && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white text-center py-2 font-mono text-sm z-50 animate-pulse">
          DESCONECTADO DO SERVIDOR — Reconectando...
        </div>
      )}

      {/* Objective (top-left) */}
      <div className="absolute top-5 left-5 max-w-md pointer-events-none">
        <h1 className="text-2xl lg:text-3xl font-mono font-bold text-[var(--color-neon-orange)] tracking-wider">
          GAMBIARRA WORLD
        </h1>
        {objective && (
          <p className="mt-2 text-lg font-body text-gray-100 bg-[var(--color-surface)]/80 border border-[var(--color-surface-light)] rounded-lg px-3 py-2">
            🎯 {objective}
          </p>
        )}
      </div>

      {/* Leaderboard (right) */}
      {board.length > 0 && (
        <div className="absolute top-5 right-5 w-64 arcade-card rounded-xl p-4 pointer-events-none">
          <h2 className="text-sm font-mono font-bold text-[var(--color-neon-yellow)] uppercase tracking-wider mb-3">
            Placar
          </h2>
          <div className="flex flex-col gap-2">
            {board.slice(0, 12).map((e, i) => (
              <div key={e.id} className="flex items-center gap-2 font-mono text-sm">
                <span className="text-gray-500 w-5 text-right">{i + 1}</span>
                <span className="text-lg leading-none">{e.emoji}</span>
                <span className="flex-1 truncate text-gray-200" style={{ color: e.color }}>
                  {e.nickname}
                </span>
                <span className="text-[var(--color-neon-green)] font-bold">{e.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty / idle state */}
      {board.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-7xl mb-4 animate-float">🌍</div>
          <h2 className="text-2xl font-mono font-bold text-gray-300 mb-2">
            {running ? 'Mundo ativo — aguardando agentes' : 'Mundo parado'}
          </h2>
          <p className="text-gray-500 font-body">
            Inicie com <code className="text-[var(--color-neon-cyan)]">POST /world/start</code>
          </p>
        </div>
      )}
    </div>
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export default WorldArena;
