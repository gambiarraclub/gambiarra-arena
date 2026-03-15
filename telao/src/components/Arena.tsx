import { useState, useEffect, useRef, useCallback } from 'react';
import ParticipantCard from './ParticipantCard';
import QRCodeGenerator from './QRCodeGenerator';

interface Participant {
  id: string;
  nickname: string;
  runner: string;
  model: string;
  lastSeen?: string;
  connected?: boolean;
}

interface Round {
  id: string;
  index: number;
  prompt: string;
  maxTokens: number;
  deadlineMs: number;
  svgMode: boolean;
  startedAt: string | null;
  endedAt: string | null;
  liveTokens?: Record<string, string[]>;
}

interface ParticipantState {
  tokens: number;
  isGenerating: boolean;
  content: string[];
  joinedContent: string; // Pre-computed join for ParticipantCard prop stability
  tokensBySeq: Record<number, string>;
  currentRound?: number;
  ttftMs?: number;
  tps?: number;
  durationMs?: number;
}

const EMPTY_STATE: ParticipantState = {
  tokens: 0,
  isGenerating: false,
  content: [],
  joinedContent: '',
  tokensBySeq: {},
};

// Polling intervals (ms)
const POLL_FAST = 3000;   // When WS is disconnected (fallback)
const POLL_SLOW = 10000;  // When WS is connected (just consistency check)

function Arena() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [participantStates, setParticipantStates] = useState<Record<string, ParticipantState>>({});
  const [votingUrl, setVotingUrl] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  // Token batching refs
  const pendingTokens = useRef<Map<string, Map<number, string>>>(new Map());
  const rafId = useRef<number | null>(null);

  // WS reconnection refs
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const MAX_RECONNECT_ATTEMPTS = 20;

  // Flush all buffered tokens in a single state update (called once per animation frame)
  const flushTokens = useCallback(() => {
    const batch = pendingTokens.current;
    if (batch.size === 0) return;
    pendingTokens.current = new Map();

    setParticipantStates((prev) => {
      const next = { ...prev };
      for (const [pid, tokens] of batch) {
        const existing = next[pid] || { ...EMPTY_STATE };

        const newTokensBySeq = { ...existing.tokensBySeq };
        let maxTotalTokens = existing.tokens;
        let changed = false;

        for (const [seq, content] of tokens) {
          if (newTokensBySeq[seq] === undefined) {
            newTokensBySeq[seq] = content;
            changed = true;
          }
        }

        if (!changed) continue;

        // Rebuild content once per participant per frame
        const sortedSeqs = Object.keys(newTokensBySeq).map(Number).sort((a, b) => a - b);
        const newContent = sortedSeqs.map(s => newTokensBySeq[s]);
        const joinedContent = newContent.join('');

        // Use the largest total_tokens seen (from msg.total_tokens stored in the map value)
        if (sortedSeqs.length > maxTotalTokens) {
          maxTotalTokens = sortedSeqs.length;
        }

        next[pid] = {
          ...existing,
          tokens: maxTotalTokens,
          isGenerating: true,
          content: newContent,
          joinedContent,
          tokensBySeq: newTokensBySeq,
        };
      }
      return next;
    });
  }, []);

  // Fetch with 429 handling — returns null on rate limit
  const safeFetch = useCallback(async (url: string): Promise<Response | null> => {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.warn(`[Arena] Rate limited on ${url}, backing off`);
        return null;
      }
      return res;
    } catch (err) {
      console.error(`[Arena] Fetch failed: ${url}`, err);
      return null;
    }
  }, []);

  // Presence polling
  useEffect(() => {
    const fetchPresence = async () => {
      const res = await safeFetch('/api/presence');
      if (!res) return;

      let data;
      if (!res.ok) {
        const fallback = await safeFetch('/api/session');
        if (!fallback || !fallback.ok) return;
        const sessionData = await fallback.json();
        data = { participants: (sessionData.participants || []).filter((p: Participant) => p.connected) };
      } else {
        data = await res.json();
      }
      setParticipants(data.participants || []);
    };

    fetchPresence();
    const interval = setInterval(fetchPresence, wsConnected ? POLL_SLOW : POLL_FAST);
    return () => clearInterval(interval);
  }, [wsConnected, safeFetch]);

  // Round polling
  useEffect(() => {
    const fetchRound = async () => {
      const res = await safeFetch('/api/rounds/current');
      if (!res) return;

      let data;
      if (res.ok) {
        data = await res.json();
      } else {
        const sessionRes = await safeFetch('/api/session');
        if (!sessionRes || !sessionRes.ok) return;
        const sessionData = await sessionRes.json();
        const rounds = sessionData.rounds || [];
        const latestRound = rounds.sort((a: Round, b: Round) => b.index - a.index)[0];
        data = latestRound || null;
      }

      if (!data) return;
      setCurrentRound(data);

      // Only sync from polling if round is NOT actively generating
      const isActivelyGenerating = data.startedAt && !data.endedAt;
      if (data.liveTokens && !isActivelyGenerating) {
        setParticipantStates((prevStates) => {
          const newStates: Record<string, ParticipantState> = { ...prevStates };
          for (const [pid, tokens] of Object.entries(data.liveTokens)) {
            const existingState = newStates[pid];
            if (!existingState) {
              const tokenArr = tokens as string[];
              const tokensBySeq: Record<number, string> = {};
              tokenArr.forEach((t, i) => { tokensBySeq[i] = t; });
              newStates[pid] = {
                tokens: tokenArr.length,
                isGenerating: !data.endedAt,
                content: tokenArr,
                joinedContent: tokenArr.join(''),
                tokensBySeq,
              };
            } else {
              const newTokens = tokens as string[];
              const existingContent = existingState.content || [];
              if (newTokens.length > existingContent.length) {
                const tokensBySeq: Record<number, string> = {};
                newTokens.forEach((t, i) => { tokensBySeq[i] = t; });
                newStates[pid] = {
                  tokens: newTokens.length,
                  isGenerating: existingState.isGenerating === false ? false : !data.endedAt,
                  content: newTokens,
                  joinedContent: newTokens.join(''),
                  tokensBySeq,
                  ttftMs: existingState.ttftMs,
                  tps: existingState.tps,
                  durationMs: existingState.durationMs,
                };
              } else {
                newStates[pid] = {
                  ...existingState,
                  isGenerating: existingState.isGenerating === false ? false : !data.endedAt,
                };
              }
            }
          }
          return newStates;
        });
      }
      if (data.endedAt && !data.liveTokens) {
        setParticipantStates((prevStates) => {
          const newStates: Record<string, ParticipantState> = {};
          for (const [pid, state] of Object.entries(prevStates)) {
            newStates[pid] = { ...state, isGenerating: false };
          }
          return newStates;
        });
      }
    };

    fetchRound();
    const interval = setInterval(fetchRound, wsConnected ? POLL_SLOW : POLL_FAST);
    return () => clearInterval(interval);
  }, [wsConnected, safeFetch]);

  // Set voting URL
  useEffect(() => {
    setVotingUrl(`${window.location.origin}/voting`);
  }, []);

  // WebSocket with reconnection
  useEffect(() => {
    mountedRef.current = true;

    const connectWs = () => {
      if (!mountedRef.current) return;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${wsProtocol}://${window.location.host}/ws`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        console.error('[Arena] Failed to create WebSocket:', err);
        scheduleReconnect();
        return;
      }

      wsRef.current = ws;

      ws.addEventListener('open', () => {
        console.info('[Arena] WebSocket connected');
        setWsConnected(true);
        reconnectAttemptsRef.current = 0;
        ws.send(JSON.stringify({ type: 'telao_register', view: 'arena' }));
      });

      ws.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);

          switch (msg.type) {
            case 'token_update': {
              const pid = msg.participant_id as string;
              const seq = msg.seq as number;
              const tokenContent = msg.content as string;

              // Buffer the token instead of updating state immediately
              if (!pendingTokens.current.has(pid)) {
                pendingTokens.current.set(pid, new Map());
              }
              pendingTokens.current.get(pid)!.set(seq, tokenContent);

              // Schedule flush on next animation frame (batches all tokens)
              if (rafId.current === null) {
                rafId.current = requestAnimationFrame(() => {
                  flushTokens();
                  rafId.current = null;
                });
              }
              break;
            }
            case 'completion': {
              const pid = msg.participant_id as string;
              // Flush any pending tokens before marking complete
              if (pendingTokens.current.has(pid)) {
                flushTokens();
                if (rafId.current !== null) {
                  cancelAnimationFrame(rafId.current);
                  rafId.current = null;
                }
              }
              setParticipantStates((prev) => {
                const existingState = prev[pid] || { ...EMPTY_STATE };
                return {
                  ...prev,
                  [pid]: {
                    ...existingState,
                    tokens: msg.tokens,
                    isGenerating: false,
                    ttftMs: msg.ttft_ms ?? existingState.ttftMs,
                    tps: msg.tps ?? existingState.tps,
                    durationMs: msg.duration_ms ?? existingState.durationMs,
                  },
                };
              });
              break;
            }
            case 'participant_registered': {
              const p = msg.participant as Participant;
              setParticipants((prev) => {
                const exists = prev.find((x) => x.id === p.id);
                if (exists) {
                  return prev.map((x) => (x.id === p.id ? { ...x, ...p } : x));
                }
                return [...prev, p];
              });
              break;
            }
            case 'participant_disconnected': {
              const pid = msg.participant_id as string;
              setParticipants((prev) => prev.filter((p) => p.id !== pid));
              setParticipantStates((prev) => {
                const next = { ...prev };
                delete next[pid];
                return next;
              });
              break;
            }
            case 'round_started': {
              const newRound = msg.round as number;
              setParticipantStates((prev) => {
                const cleared: Record<string, ParticipantState> = {};
                for (const [pid] of Object.entries(prev)) {
                  cleared[pid] = {
                    ...EMPTY_STATE,
                    isGenerating: true,
                    currentRound: newRound,
                  };
                }
                return cleared;
              });
              break;
            }
            default:
              break;
          }
        } catch (e) {
          console.error('[Arena] Invalid WS message', e);
        }
      });

      ws.addEventListener('close', () => {
        console.warn('[Arena] WebSocket disconnected');
        setWsConnected(false);
        wsRef.current = null;
        scheduleReconnect();
      });

      ws.addEventListener('error', (err) => {
        console.error('[Arena] WebSocket error', err);
      });
    };

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`[Arena] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
        return;
      }

      reconnectAttemptsRef.current++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000);
      console.info(`[Arena] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);

      reconnectTimerRef.current = setTimeout(connectWs, delay);
    };

    connectWs();

    return () => {
      mountedRef.current = false;
      if (rafId.current !== null) cancelAnimationFrame(rafId.current);
      if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [flushTokens]);

  return (
    <div className="min-h-screen p-6 lg:p-8">
      {/* WebSocket disconnected banner */}
      {!wsConnected && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 font-mono text-sm z-50 animate-pulse">
          DESCONECTADO DO SERVIDOR — Reconectando...
        </div>
      )}

      {/* Header */}
      <header className="mb-8 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl lg:text-5xl font-mono font-bold text-neon-orange tracking-wider glitch">
            GAMBIARRA ARENA
          </h1>
          <div className="hidden lg:flex items-center gap-4">
            <div className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded font-mono text-sm">
              <span className="text-[var(--color-neon-yellow)]">{participants.length}</span>
              <span className="text-gray-400 ml-2">conectados</span>
            </div>
          </div>
        </div>

        {/* Round info card */}
        {currentRound && (
          <div className="arcade-card rounded-xl p-6 animate-fade-in-up">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-3 py-1 bg-[var(--color-neon-purple)]/20 border border-[var(--color-neon-purple)] rounded font-mono font-bold text-[var(--color-neon-purple)] text-sm uppercase tracking-wider">
                    Rodada {currentRound.index}
                  </span>
                  {currentRound.startedAt && !currentRound.endedAt && (
                    <div className="live-indicator">
                      <span>AO VIVO</span>
                    </div>
                  )}
                  {currentRound.endedAt && (
                    <span className="px-3 py-1 bg-red-500/20 border border-red-500 rounded font-mono font-semibold text-red-400 text-xs uppercase tracking-wider">
                      Encerrada
                    </span>
                  )}
                </div>
                <p className="text-xl lg:text-2xl font-body text-gray-100 leading-relaxed">
                  {currentRound.prompt}
                </p>
              </div>
              <div className="flex flex-wrap gap-4 lg:gap-6 text-sm font-mono">
                <div className="flex flex-col items-center p-3 bg-[var(--color-midnight)] rounded-lg border border-[var(--color-surface-light)]">
                  <span className="text-2xl font-mono font-bold text-neon-cyan">{currentRound.maxTokens}</span>
                  <span className="text-xs text-gray-500 uppercase">tokens</span>
                </div>
                <div className="flex flex-col items-center p-3 bg-[var(--color-midnight)] rounded-lg border border-[var(--color-surface-light)]">
                  <span className="text-2xl font-mono font-bold text-neon-yellow">{(currentRound.deadlineMs / 1000).toFixed(0)}s</span>
                  <span className="text-xs text-gray-500 uppercase">prazo</span>
                </div>
                {currentRound.svgMode && (
                  <div className="flex flex-col items-center p-3 bg-[var(--color-neon-pink)]/10 rounded-lg border border-[var(--color-neon-pink)]">
                    <span className="text-2xl">🎨</span>
                    <span className="text-xs text-[var(--color-neon-pink)] uppercase font-semibold">SVG</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* No round message */}
        {!currentRound && (
          <div className="arcade-card rounded-xl p-8 text-center animate-fade-in-up">
            <div className="text-6xl mb-4 animate-float">⏳</div>
            <h2 className="text-2xl font-mono font-bold text-gray-300 mb-2">
              Aguardando rodada
            </h2>
            <p className="text-gray-500 font-body">
              O administrador iniciará a competição em breve...
            </p>
          </div>
        )}
      </header>

      {/* Progress bar - shows generating vs completed participants */}
      {currentRound && participants.length > 0 && (
        <div className="mb-6 animate-fade-in">
          {(() => {
            const total = participants.length;
            const generating = participants.filter(
              (p) => participantStates[p.id]?.isGenerating === true
            ).length;
            const completed = participants.filter(
              (p) =>
                participantStates[p.id]?.isGenerating === false &&
                (participantStates[p.id]?.content?.length > 0 || participantStates[p.id]?.tokens > 0)
            ).length;
            const waiting = total - generating - completed;

            const completedPercent = total > 0 ? (completed / total) * 100 : 0;
            const generatingPercent = total > 0 ? (generating / total) * 100 : 0;
            const waitingPercent = total > 0 ? (waiting / total) * 100 : 0;

            return (
              <div className="arcade-card rounded-lg p-4">
                <div className="flex items-center justify-between mb-2 text-sm font-mono">
                  <div className="flex items-center gap-4">
                    {completed > 0 && (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[var(--color-neon-green)]"></span>
                        <span className="text-[var(--color-neon-green)]">{completed}</span>
                        <span className="text-gray-500">prontos</span>
                      </span>
                    )}
                    {generating > 0 && (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-[var(--color-neon-pink)] animate-pulse"></span>
                        <span className="text-[var(--color-neon-pink)]">{generating}</span>
                        <span className="text-gray-500">gerando</span>
                      </span>
                    )}
                    {waiting > 0 && (
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-gray-600"></span>
                        <span className="text-gray-400">{waiting}</span>
                        <span className="text-gray-500">aguardando</span>
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400">
                    {completed}/{total}
                  </span>
                </div>
                <div className="h-3 bg-[var(--color-midnight)] rounded-full overflow-hidden flex">
                  {completedPercent > 0 && (
                    <div
                      className="h-full bg-[var(--color-neon-green)] transition-all duration-500 ease-out"
                      style={{ width: `${completedPercent}%` }}
                    />
                  )}
                  {generatingPercent > 0 && (
                    <div
                      className="h-full bg-[var(--color-neon-pink)] transition-all duration-500 ease-out relative overflow-hidden"
                      style={{ width: `${generatingPercent}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </div>
                  )}
                  {waitingPercent > 0 && (
                    <div
                      className="h-full bg-gray-700 transition-all duration-500 ease-out"
                      style={{ width: `${waitingPercent}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Participants grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 mb-10">
        {participants.map((participant, index) => {
          const state = participantStates[participant.id] || EMPTY_STATE;

          return (
            <div
              key={participant.id}
              className={`animate-fade-in-up stagger-${Math.min(index + 1, 6)}`}
              style={{ opacity: 0 }}
            >
              <ParticipantCard
                participant={participant}
                tokens={state.tokens}
                maxTokens={currentRound?.maxTokens || 400}
                isGenerating={state.isGenerating}
                content={state.joinedContent}
                svgMode={currentRound?.svgMode || false}
                ttftMs={state.ttftMs}
                tps={state.tps}
                durationMs={state.durationMs}
              />
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {participants.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <div className="text-8xl mb-6 animate-float">👾</div>
          <h2 className="text-3xl font-mono font-bold text-gray-400 mb-3">
            Nenhum participante conectado
          </h2>
          <p className="text-gray-500 font-body text-lg">
            Aguardando jogadores entrarem na arena...
          </p>
        </div>
      )}

      {/* Footer with QR code */}
      <footer className="mt-8 flex justify-center animate-fade-in">
        <div className="arcade-card rounded-xl p-6 lg:p-8 text-center max-w-md">
          <h3 className="text-xl lg:text-2xl font-mono font-bold text-neon-yellow mb-4 tracking-wider">
            VOTE NAS RESPOSTAS!
          </h3>
          <div className="p-4 bg-white rounded-lg inline-block mb-4">
            <QRCodeGenerator value={votingUrl} size={180} />
          </div>
          <p className="text-sm font-mono text-gray-400">
            Escaneie o QR code ou acesse:
          </p>
          <p className="text-[var(--color-neon-cyan)] font-mono text-sm mt-1 break-all">
            {votingUrl}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Arena;
