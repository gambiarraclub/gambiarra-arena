import { useState, useEffect, useCallback, useRef } from 'react';
import { useTelaoSocket } from '../hooks/useTelaoSocket';
import { extractSvg, SvgFitBox } from './SvgRenderer';

interface Response {
  participant_id: string;
  nickname: string;
  generated_content: string | null;
}

interface Round {
  id: string;
  index: number;
  prompt: string;
  votingStatus: string;
  svgMode: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

interface VotedParticipant {
  participantId: string;
  score: number;
}

// Generate a UUID-like string (fallback for non-HTTPS)
function generateUUID(): string {
  // Use crypto.randomUUID if available (HTTPS only)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for HTTP connections
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Get or create voter ID in localStorage
function getVoterId(): string {
  const key = 'gambiarra-voter-id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// Fisher-Yates shuffle
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function Voting() {
  const [round, setRound] = useState<Round | null>(null);
  const [currentRoundId, setCurrentRoundId] = useState<string | null>(null); // Track current round to detect changes
  const [responses, setResponses] = useState<Response[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [votedParticipants, setVotedParticipants] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voterId] = useState(getVoterId);
  const [svgMode, setSvgMode] = useState(false);

  // Anti-flicker: once we have rendered real state, transient failures
  // (429, server restart, dropped WS) must never replace it with an error
  // screen — that alternation was the 2026-05-23 "flickering".
  const hasDataRef = useRef(false);

  // Latest round, readable from WS callbacks without re-subscribing
  const roundRef = useRef<Round | null>(null);

  // Fetch responses + my votes for a round whose voting is open (one-shot)
  const fetchVotingData = useCallback(async (roundToFetch: Round) => {
    try {
      const responsesRes = await fetch(`/api/rounds/${roundToFetch.id}/responses`);
      if (responsesRes.ok) {
        const data = await responsesRes.json();
        // Always update svgMode
        setSvgMode(data.svgMode);

        // Shuffle once on first load, then keep the order stable but MERGE
        // newcomers (late `complete` arrivals) at the end — freezing the
        // first non-empty list made late finishers unvotable on phones that
        // had already loaded.
        const incoming: Response[] = data.responses ?? [];
        setResponses((prevResponses) => {
          if (incoming.length === 0) return prevResponses;
          if (prevResponses.length === 0) return shuffleArray(incoming);
          const known = new Set(prevResponses.map((r) => r.participant_id));
          const fresh = incoming.filter((r) => !known.has(r.participant_id));
          return fresh.length > 0 ? [...prevResponses, ...shuffleArray(fresh)] : prevResponses;
        });
      }

      // Fetch already voted participants for THIS round
      const votedRes = await fetch(`/api/votes/mine?roundId=${roundToFetch.id}&voterId=${voterId}`);
      if (votedRes.ok) {
        const voted = await votedRes.json();
        const votedMap = new Map<string, number>();
        voted.forEach((v: VotedParticipant) => votedMap.set(v.participantId, v.score));
        setVotedParticipants(votedMap);
      }
    } catch (err) {
      console.warn('[Voting] Failed to fetch voting data (will retry):', err);
    }
  }, [voterId]);

  // Apply a round update (from WS push or polling fallback)
  const applyRound = useCallback((latestRound: Round | null) => {
    if (!latestRound || (!latestRound.startedAt && !latestRound.endedAt)) {
      // Ignore rounds that never started (created in advance by the admin)
      if (!hasDataRef.current) setLoading(false);
      return;
    }

    // Check if round changed - if so, reset all state
    setCurrentRoundId((prevRoundId) => {
      if (prevRoundId !== null && prevRoundId !== latestRound.id) {
        console.log('Round changed from', prevRoundId, 'to', latestRound.id);
        setResponses([]);
        setCurrentIndex(0);
        setVotedParticipants(new Map());
        setSvgMode(false);
      }
      return latestRound.id;
    });

    setRound(latestRound);
    roundRef.current = latestRound;
    hasDataRef.current = true;
    setError(null);
    setLoading(false);

    if (latestRound.votingStatus === 'open') {
      fetchVotingData(latestRound);
    }
  }, [fetchVotingData]);

  // WebSocket push: server sends state_snapshot on register and round_state
  // on every lifecycle change — this replaces the aggressive /session polling
  const wsConnected = useTelaoSocket('voting', useCallback((msg: any) => {
    if (msg.type === 'state_snapshot') {
      applyRound((msg.round as Round) ?? null);
      setLoading(false);
    } else if (msg.type === 'round_state') {
      applyRound(msg.round as Round);
    } else if (msg.type === 'completion') {
      // A straggler finished after voting opened — pull it into the list
      const current = roundRef.current;
      if (current?.votingStatus === 'open') {
        fetchVotingData(current);
      }
    }
  }, [applyRound, fetchVotingData]));

  // Polling fallback (slow): only fills in if WS is down or misses an update
  const fetchData = useCallback(async () => {
    try {
      // Get session to find the latest round
      const sessionRes = await fetch('/api/session');
      if (sessionRes.status === 429) {
        console.warn('[Voting] Rate limited, backing off');
        return;
      }
      if (!sessionRes.ok) {
        // Keep showing the last good state; only error out if we never had one
        if (!hasDataRef.current) {
          setError('Nenhuma sessão ativa');
          setLoading(false);
        }
        return;
      }

      const session = await sessionRes.json();
      const rounds = session.rounds || [];

      // Find the most recent round that has ended or is active
      const latestRound = rounds
        .sort((a: Round, b: Round) => b.index - a.index)
        .find((r: Round) => r.endedAt || r.startedAt);

      if (!latestRound) {
        setRound(null);
        setLoading(false);
        return;
      }

      applyRound(latestRound);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      if (!hasDataRef.current) {
        setError('Erro ao carregar dados');
        setLoading(false);
      }
    }
  }, [applyRound]);

  // Retry sooner while voting is open but responses haven't loaded yet
  const needsVotingData = round?.votingStatus === 'open' && responses.length === 0;

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, wsConnected && !needsVotingData ? 30000 : 8000);
    return () => clearInterval(interval);
  }, [fetchData, wsConnected, needsVotingData]);

  const handleVote = async (score: number) => {
    if (!round || responses.length === 0) return;

    const participant = responses[currentIndex];

    try {
      const res = await fetch('/api/votes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: round.id,
          participantId: participant.participant_id,
          score,
          voterId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === 'Already voted for this participant') {
          // Already voted, just update UI
        } else {
          throw new Error(data.error || 'Failed to vote');
        }
      }

      // Update local state
      setVotedParticipants((prev) => {
        const newMap = new Map(prev);
        newMap.set(participant.participant_id, score);
        return newMap;
      });

      // Auto advance to next unvoted participant
      const nextUnvotedIndex = responses.findIndex(
        (r, i) => i > currentIndex && !votedParticipants.has(r.participant_id)
      );

      if (nextUnvotedIndex !== -1) {
        setCurrentIndex(nextUnvotedIndex);
      } else if (currentIndex < responses.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch (err) {
      console.error('Failed to vote:', err);
      alert('Erro ao enviar voto. Tente novamente.');
    }
  };

  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < responses.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-4 animate-spin-slow">⚡</div>
          <h2 className="text-2xl font-mono font-bold text-neon-orange tracking-wider">
            Carregando...
          </h2>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-mono font-bold text-red-400">
            {error}
          </h2>
        </div>
      </div>
    );
  }

  // No round or voting not started
  if (!round || !round.endedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="text-7xl mb-6 animate-float">⏳</div>
          <h2 className="text-3xl font-mono font-bold text-neon-yellow mb-4 tracking-wider">
            Aguarde a rodada encerrar
          </h2>
          <p className="text-lg text-gray-400 font-body">
            A votação será liberada em breve...
          </p>
          <div className="mt-6 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-3 h-3 rounded-full bg-[var(--color-neon-orange)] animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Voting closed
  if (round.votingStatus === 'closed' || round.votingStatus === 'revealed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="text-8xl mb-6 animate-float">🏆</div>
          <h2 className="text-3xl font-mono font-bold text-neon-yellow mb-4 tracking-wider">
            Votação Encerrada
          </h2>
          <p className="text-lg text-gray-400 font-body max-w-xs mx-auto">
            {round.votingStatus === 'revealed'
              ? 'Acompanhe a premiação no telão!'
              : 'Aguarde a revelação dos resultados no telão.'}
          </p>
        </div>
      </div>
    );
  }

  // No responses yet
  if (responses.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-4 animate-pulse">📭</div>
          <h2 className="text-xl font-mono font-bold text-gray-400 mb-2">
            Nenhuma resposta disponível
          </h2>
          <p className="text-gray-500 font-body text-sm">
            Aguarde os participantes completarem suas respostas.
          </p>
          <p className="text-xs text-gray-600 mt-4 font-mono">
            Atualizando automaticamente...
          </p>
        </div>
      </div>
    );
  }

  const currentResponse = responses[currentIndex];
  // Extract the SVG from the raw model output (which usually wraps it in
  // prose/markdown) and normalize its size — injecting the raw content made
  // drawings render at the model's fixed width/height, tiny on phones.
  const currentSvg = svgMode && currentResponse.generated_content
    ? extractSvg(currentResponse.generated_content)
    : null;
  const isVoted = votedParticipants.has(currentResponse.participant_id);
  const votedScore = votedParticipants.get(currentResponse.participant_id);
  const votedCount = votedParticipants.size;
  const totalResponses = responses.length;

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6">
      {/* Header */}
      <header className="mb-4 text-center animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-mono font-bold text-neon-orange mb-2 tracking-wider">
          🗳️ VOTAÇÃO
        </h1>
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="px-3 py-1 bg-[var(--color-neon-purple)]/20 border border-[var(--color-neon-purple)] rounded font-mono font-semibold text-[var(--color-neon-purple)] text-sm uppercase tracking-wider">
            Rodada {round.index}
          </span>
        </div>
        <p className="text-sm text-gray-400 font-body mb-3 max-w-md mx-auto line-clamp-2">
          {round.prompt}
        </p>
        <div className="flex justify-center gap-4 text-sm font-mono">
          <span className="text-gray-500">
            <span className="text-neon-cyan font-bold">{currentIndex + 1}</span>/{totalResponses}
          </span>
          <span className="text-[var(--color-neon-orange)]">
            <span className="font-bold">{votedCount}</span> votados
          </span>
        </div>
      </header>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 mb-4 flex-wrap max-w-sm mx-auto">
        {responses.map((r, i) => (
          <button
            key={r.participant_id}
            onClick={() => setCurrentIndex(i)}
            className={`w-3 h-3 rounded-full transition-all ${
              i === currentIndex
                ? 'bg-[var(--color-neon-orange)] scale-125 ring-2 ring-[var(--color-neon-orange)]/50'
                : votedParticipants.has(r.participant_id)
                ? 'bg-[var(--color-neon-cyan)]'
                : 'bg-[var(--color-surface-light)]'
            }`}
          />
        ))}
      </div>

      {/* Main card */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full animate-fade-in-up">
        <div className="flex-1 arcade-card rounded-xl flex flex-col overflow-hidden">
          {/* Participant name */}
          <div className="p-4 border-b border-[var(--color-surface-light)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-neon-orange)] to-[var(--color-neon-pink)] flex items-center justify-center text-lg font-mono font-bold text-[var(--color-deep-blue)]">
                {currentResponse.nickname.charAt(0).toUpperCase()}
              </div>
              <h2 className="text-lg font-mono font-bold text-neon-cyan tracking-wide">
                {currentResponse.nickname}
              </h2>
            </div>
            {isVoted && (
              <span className="px-3 py-1 bg-[var(--color-neon-cyan)]/20 border border-[var(--color-neon-cyan)] rounded-full text-sm font-mono font-bold text-[var(--color-neon-cyan)]">
                ✓ Nota: {votedScore}
              </span>
            )}
          </div>

          {/* Response content */}
          <div className="flex-1 p-4 overflow-auto bg-[var(--color-midnight)]">
            {currentSvg ? (
              <SvgFitBox
                svg={currentSvg}
                className="svg-fit w-full h-full flex items-center justify-center bg-white rounded-lg p-3 min-h-[200px]"
                fallback={
                  <div>
                    <div className="mb-3 px-3 py-2 bg-yellow-900/30 border border-yellow-700 rounded text-yellow-400 text-xs font-mono">
                      ⚠️ O SVG deste participante não pôde ser renderizado. Avalie pela resposta abaixo:
                    </div>
                    <div className="whitespace-pre-wrap text-gray-300 font-mono text-xs leading-relaxed">
                      {currentResponse.generated_content}
                    </div>
                  </div>
                }
              />
            ) : (
              <div className="whitespace-pre-wrap text-gray-300 font-mono text-sm leading-relaxed">
                {currentResponse.generated_content || '(Sem resposta)'}
              </div>
            )}
          </div>

          {/* Vote buttons */}
          {!isVoted && (
            <div className="p-4 border-t border-[var(--color-surface-light)]">
              <p className="text-center text-gray-500 mb-3 text-xs font-body uppercase tracking-wider">
                Dê sua nota (0 = ruim, 5 = excelente)
              </p>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => handleVote(score)}
                    className={`flex-1 py-4 rounded-lg text-xl font-mono font-bold transition-all
                      ${score === 0 ? 'bg-red-900/30 text-red-400 border-2 border-red-800 hover:bg-red-500 hover:text-white' :
                        score <= 2 ? 'bg-[var(--color-surface)] text-gray-400 border-2 border-[var(--color-surface-light)] hover:bg-[var(--color-neon-orange)] hover:text-[var(--color-deep-blue)] hover:border-[var(--color-neon-orange)]' :
                        score <= 4 ? 'bg-[var(--color-surface)] text-gray-300 border-2 border-[var(--color-surface-light)] hover:bg-[var(--color-neon-yellow)] hover:text-[var(--color-deep-blue)] hover:border-[var(--color-neon-yellow)]' :
                        'bg-[var(--color-neon-cyan)]/20 text-[var(--color-neon-cyan)] border-2 border-[var(--color-neon-cyan)] hover:bg-[var(--color-neon-cyan)] hover:text-[var(--color-deep-blue)]'
                      }
                      active:scale-95`}
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Already voted indicator */}
          {isVoted && (
            <div className="p-4 border-t border-[var(--color-surface-light)] bg-[var(--color-neon-cyan)]/5">
              <p className="text-center text-[var(--color-neon-cyan)] font-mono font-semibold text-sm">
                ✓ Voto registrado
              </p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-4 gap-3">
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className={`flex-1 py-3 rounded-lg font-mono font-bold text-sm uppercase tracking-wider transition-all ${
              currentIndex === 0
                ? 'bg-[var(--color-midnight)] text-gray-700 cursor-not-allowed border-2 border-[var(--color-surface)]'
                : 'bg-[var(--color-surface)] text-gray-300 border-2 border-[var(--color-surface-light)] hover:border-[var(--color-neon-orange)] hover:text-[var(--color-neon-orange)]'
            }`}
          >
            ← Anterior
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex === responses.length - 1}
            className={`flex-1 py-3 rounded-lg font-mono font-bold text-sm uppercase tracking-wider transition-all ${
              currentIndex === responses.length - 1
                ? 'bg-[var(--color-midnight)] text-gray-700 cursor-not-allowed border-2 border-[var(--color-surface)]'
                : 'bg-[var(--color-surface)] text-gray-300 border-2 border-[var(--color-surface-light)] hover:border-[var(--color-neon-orange)] hover:text-[var(--color-neon-orange)]'
            }`}
          >
            Próximo →
          </button>
        </div>
      </div>

      {/* Completion message */}
      {votedCount === totalResponses && (
        <div className="mt-4 text-center animate-bounce-in">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-[var(--color-neon-cyan)]/20 border border-[var(--color-neon-cyan)] rounded-xl">
            <span className="text-2xl">🎉</span>
            <span className="text-[var(--color-neon-cyan)] font-mono font-bold">
              Você votou em todas as respostas!
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Voting;
