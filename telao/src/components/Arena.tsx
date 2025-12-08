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
}

interface ParticipantState {
  tokens: number;
  isGenerating: boolean;
  content: string[];
}

function Arena() {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [participantStates, setParticipantStates] = useState<Record<string, ParticipantState>>({});
  const [votingUrl, setVotingUrl] = useState('');

  useEffect(() => {
    const ONLINE_THRESHOLD_MS = 60_000; // 60s: consider participant online if seen within this window
    // Fetch session data periodically
    const fetchSession = () => {
      fetch('/api/session')
        .then((res) => res.json())
        .then((data) => {
          // Prefer explicit `connected` flag; fall back to lastSeen if absent
          const parts = (data.participants || []).filter((p: Participant) => {
            if (typeof p.connected === 'boolean') return p.connected;
            try {
              if (!p.lastSeen) return false;
              return Date.now() - new Date(p.lastSeen).getTime() < ONLINE_THRESHOLD_MS;
            } catch (e) {
              return false;
            }
          });

          setParticipants(parts);
        })
        .catch((err) => console.error('Failed to fetch session:', err));
    };

    fetchSession();
    const sessionInterval = setInterval(fetchSession, 2000);

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
          setCurrentRound(data);
          // Initialize participant states from live tokens
          if (data.liveTokens) {
            setParticipantStates((prevStates) => {
              const newStates: Record<string, ParticipantState> = { ...prevStates };
              for (const [pid, tokens] of Object.entries(data.liveTokens)) {
                // Only update if we don't have this participant yet, or merge carefully
                const existingState = newStates[pid];
                if (!existingState) {
                  // New participant - initialize
                  newStates[pid] = {
                    tokens: (tokens as string[]).length,
                    isGenerating: !data.endedAt,
                    content: tokens as string[],
                  };
                } else {
                  // Existing participant - preserve isGenerating if already false
                  // Also preserve content if new content is empty but we have existing content
                  const newTokens = tokens as string[];
                  newStates[pid] = {
                    tokens: newTokens.length || existingState.tokens,
                    isGenerating: existingState.isGenerating === false ? false : !data.endedAt,
                    content: newTokens.length > 0 ? newTokens : existingState.content,
                  };
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
      clearInterval(sessionInterval);
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

        switch (msg.type) {
          case 'token_update': {
            const pid = msg.participant_id as string;
            setParticipantStates((prev) => {
              const next = { ...prev };
              const state = next[pid] || { tokens: 0, isGenerating: false, content: [] };
              state.tokens = msg.total_tokens;
              state.isGenerating = true;
              state.content = [...(state.content || []), msg.content];
              next[pid] = state;
              return next;
            });
            break;
          }
          case 'completion': {
            const pid = msg.participant_id as string;
            setParticipantStates((prev) => {
              const next = { ...prev };
              const state = next[pid] || { tokens: 0, isGenerating: false, content: [] };
              state.tokens = msg.tokens;
              state.isGenerating = false;
              next[pid] = state;
              return next;
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
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-6xl font-bold text-primary mb-4">
          🎮 Gambiarra LLM Club Arena
        </h1>
        {currentRound && (
          <div className="bg-gray-800 p-6 rounded-lg">
            <h2 className="text-3xl font-semibold mb-2">
              Rodada {currentRound.index}
            </h2>
            <p className="text-xl text-gray-300">{currentRound.prompt}</p>
            <div className="mt-4 flex gap-4 text-sm text-gray-400">
              <span>Max tokens: {currentRound.maxTokens}</span>
              <span>Prazo: {(currentRound.deadlineMs / 1000).toFixed(0)}s</span>
              {currentRound.startedAt && !currentRound.endedAt && (
                <span className="text-green-400 font-semibold">● AO VIVO</span>
              )}
              {currentRound.endedAt && (
                <span className="text-red-400">● ENCERRADA</span>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {participants.map((participant) => {
          const state = participantStates[participant.id] || {
            tokens: 0,
            isGenerating: false,
            content: [],
          };

          return (
            <ParticipantCard
              key={participant.id}
              participant={participant}
              tokens={state.tokens}
              maxTokens={currentRound?.maxTokens || 400}
              isGenerating={state.isGenerating}
              content={state.content.join('')}
              svgMode={currentRound?.svgMode || false}
            />
          );
        })}
      </div>

      <footer className="mt-12 flex justify-center">
        <div className="bg-gray-800 p-6 rounded-lg text-center">
          <h3 className="text-2xl font-semibold mb-4">Vote nas respostas!</h3>
          <QRCodeGenerator value={votingUrl} size={200} />
          <p className="mt-4 text-gray-400">
            Escaneie o QR code ou acesse: {votingUrl}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default Arena;
