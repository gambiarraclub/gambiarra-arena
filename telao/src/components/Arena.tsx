import { useState, useEffect } from 'react';
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

interface TokenUpdate {
  type: 'token_update';
  participant_id: string;
  round: number;
  seq: number;
  content: string;
  total_tokens: number;
}

interface Completion {
  type: 'completion';
  participant_id: string;
  round: number;
  tokens: number;
  duration_ms: number;
  ttft_ms?: number | null;
  tps?: number | null;
}

interface ParticipantState {
  tokens: number;
  isGenerating: boolean;
  content: string[];
  tokensBySeq: Record<number, string>; // seq -> token for deduplication
  currentRound?: number; // Track which round the tokens belong to
  ttftMs?: number;
  tps?: number;
  durationMs?: number;
}

function Arena() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [participantStates, setParticipantStates] = useState<Record<string, ParticipantState>>({});
  const [votingUrl, setVotingUrl] = useState('');

  useEffect(() => {
    // Fetch connected participants from authoritative presence endpoint
    // Uses in-memory state on server (not database) for accurate live presence
    const fetchPresence = () => {
      fetch('/api/presence')
        .then((res) => {
          if (!res.ok) {
            // Fall back to session endpoint if presence not available
            return fetch('/api/session').then((r) => r.json()).then((data) => ({
              participants: (data.participants || []).filter((p: Participant) => p.connected),
            }));
          }
          return res.json();
        })
        .then((data) => {
          // Data from /presence is already filtered to connected participants
          setParticipants(data.participants || []);
        })
        .catch((err) => console.error('Failed to fetch presence:', err));
    };

    fetchPresence();
    const presenceInterval = setInterval(fetchPresence, 2000);

    // Fetch current round (or latest round if none active)
    const fetchRound = () => {
      // First try to get active round
      fetch('/api/rounds/current')
        .then((res) => {
          if (res.ok) return res.json();
          // If no active round, fetch from session to get latest round
          return fetch('/api/session')
            .then((sessionRes) => sessionRes.json())
            .then((sessionData) => {
              const rounds = sessionData.rounds || [];
              // Get the most recent round (highest index)
              const latestRound = rounds.sort((a: Round, b: Round) => b.index - a.index)[0];
              return latestRound || null;
            });
        })
        .then((data) => {
          if (!data) return;

          // Update current round
          setCurrentRound(data);

          // Only sync from polling if round is NOT actively generating
          // During active generation, WebSocket handles updates exclusively
          const isActivelyGenerating = data.startedAt && !data.endedAt;
          if (data.liveTokens && !isActivelyGenerating) {
            setParticipantStates((prevStates) => {
              const newStates: Record<string, ParticipantState> = { ...prevStates };
              for (const [pid, tokens] of Object.entries(data.liveTokens)) {
                // Only update if we don't have this participant yet, or merge carefully
                const existingState = newStates[pid];
                if (!existingState) {
                  // New participant - initialize from polling data
                  const tokenArr = tokens as string[];
                  const tokensBySeq: Record<number, string> = {};
                  tokenArr.forEach((t, i) => { tokensBySeq[i] = t; });
                  newStates[pid] = {
                    tokens: tokenArr.length,
                    isGenerating: !data.endedAt,
                    content: tokenArr,
                    tokensBySeq,
                  };
                } else {
                  // Existing participant - preserve WebSocket state if it has more data
                  // Polling should NOT overwrite WebSocket streaming data
                  const newTokens = tokens as string[];
                  const existingContent = existingState.content || [];

                  // Only use polling data if it has MORE tokens than what we have
                  if (newTokens.length > existingContent.length) {
                    const tokensBySeq: Record<number, string> = {};
                    newTokens.forEach((t, i) => { tokensBySeq[i] = t; });
                    newStates[pid] = {
                      tokens: newTokens.length,
                      isGenerating: existingState.isGenerating === false ? false : !data.endedAt,
                      content: newTokens,
                      tokensBySeq,
                      ttftMs: existingState.ttftMs,
                      tps: existingState.tps,
                      durationMs: existingState.durationMs,
                    };
                  } else {
                    // Keep existing state, just update isGenerating if round ended
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
          // If round ended and we have no liveTokens, preserve existing states but mark as not generating
          if (data.endedAt && !data.liveTokens) {
            setParticipantStates((prevStates) => {
              const newStates: Record<string, ParticipantState> = {};
              for (const [pid, state] of Object.entries(prevStates)) {
                // Preserve all state including metrics
                newStates[pid] = { ...state, isGenerating: false };
              }
              return newStates;
            });
          }
        })
        .catch((err) => console.error('Failed to fetch round:', err));
    };

    fetchRound();
    const interval = setInterval(fetchRound, 2000);

    // Set voting URL
    const baseUrl = window.location.origin;
    setVotingUrl(`${baseUrl}/voting`);

    return () => {
      clearInterval(interval);
      clearInterval(presenceInterval);
    };
  }, []);

  // WebSocket for live updates (optional enhancement)
  // This would listen to the /ws endpoint for real-time token updates
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${window.location.host}/ws`;
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      console.error('Failed to open WebSocket to', wsUrl, err);
      return;
    }

    ws.addEventListener('open', () => {
      // Register as telao
      ws!.send(JSON.stringify({ type: 'telao_register', view: 'arena' }));
    });

    ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        console.log('[WS] Received:', msg.type, msg);

        switch (msg.type) {
          case 'token_update': {
            const pid = msg.participant_id as string;
            const seq = msg.seq as number;
            const round = msg.round as number;
            const tokenContent = msg.content as string;
            setParticipantStates((prev) => {
              const existingState = prev[pid] || { tokens: 0, isGenerating: false, content: [], tokensBySeq: {} };

              // Check if round changed - if so, reset tokensBySeq
              const roundChanged = existingState.currentRound !== undefined && existingState.currentRound !== round;
              const existingTokensBySeq = roundChanged ? {} : (existingState.tokensBySeq || {});

              // Skip if we already have this seq (duplicate)
              if (existingTokensBySeq[seq] !== undefined) {
                return prev;
              }

              // Add token to map
              const newTokensBySeq = { ...existingTokensBySeq, [seq]: tokenContent };

              // Rebuild content array from map (sorted by seq)
              const sortedSeqs = Object.keys(newTokensBySeq).map(Number).sort((a, b) => a - b);
              const newContent = sortedSeqs.map(s => newTokensBySeq[s]);

              return {
                ...prev,
                [pid]: {
                  ...existingState,
                  tokens: msg.total_tokens,
                  isGenerating: true,
                  content: newContent,
                  tokensBySeq: newTokensBySeq,
                  currentRound: round,
                },
              };
            });
            break;
          }
          case 'completion': {
            const pid = msg.participant_id as string;
            setParticipantStates((prev) => {
              const existingState = prev[pid] || { tokens: 0, isGenerating: false, content: [], tokensBySeq: {} };
              // Return new state object (immutable update)
              return {
                ...prev,
                [pid]: {
                  ...existingState,
                  tokens: msg.tokens,
                  isGenerating: false,
                  // Store server-calculated metrics
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
            // Clear all participant content for the new round
            setParticipantStates((prev) => {
              const cleared: Record<string, ParticipantState> = {};
              for (const [pid] of Object.entries(prev)) {
                cleared[pid] = {
                  tokens: 0,
                  isGenerating: true,
                  content: [],
                  tokensBySeq: {},
                  currentRound: newRound,
                  // Clear metrics from previous round
                  ttftMs: undefined,
                  tps: undefined,
                  durationMs: undefined,
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
        console.error('Invalid WS message', e);
      }
    });

    ws.addEventListener('close', () => {
      console.info('Telao WS closed');
    });

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, []);

  return (
    <div className="min-h-screen p-6 lg:p-8">
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
          const state = participantStates[participant.id] || {
            tokens: 0,
            isGenerating: false,
            content: [],
            tokensBySeq: {},
          };

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
                content={state.content.join('')}
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
