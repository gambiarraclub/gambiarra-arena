import { useState, useEffect, useCallback } from 'react';

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

  // Fetch round and responses
  const fetchData = useCallback(async () => {
    try {
      // Get session to find the latest round
      const sessionRes = await fetch('/api/session');
      if (!sessionRes.ok) {
        setError('Nenhuma sessão ativa');
        setLoading(false);
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

      // Check if round changed - if so, reset all state
      setCurrentRoundId((prevRoundId) => {
        if (prevRoundId !== null && prevRoundId !== latestRound.id) {
          // Round changed! Reset everything
          console.log('Round changed from', prevRoundId, 'to', latestRound.id);
          setResponses([]);
          setCurrentIndex(0);
          setVotedParticipants(new Map());
          setSvgMode(false);
        }
        return latestRound.id;
      });

      setRound(latestRound);

      // If voting is open, fetch responses
      if (latestRound.votingStatus === 'open') {
        const responsesRes = await fetch(`/api/rounds/${latestRound.id}/responses`);
        if (responsesRes.ok) {
          const data = await responsesRes.json();
          // Always update svgMode
          setSvgMode(data.svgMode);

          // Shuffle responses only once when loading OR when round changed
          // Use functional update to check current state
          setResponses((prevResponses) => {
            // If no responses yet, load and shuffle them
            if (prevResponses.length === 0 && data.responses.length > 0) {
              return shuffleArray(data.responses);
            }
            return prevResponses;
          });
        }

        // Fetch already voted participants for THIS round
        const votedRes = await fetch(`/api/votes/mine?roundId=${latestRound.id}&voterId=${voterId}`);
        if (votedRes.ok) {
          const voted = await votedRes.json();
          const votedMap = new Map<string, number>();
          voted.forEach((v: VotedParticipant) => votedMap.set(v.participantId, v.score));
          setVotedParticipants(votedMap);
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Erro ao carregar dados');
      setLoading(false);
    }
  }, [voterId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

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
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-spin">⏳</div>
          <h2 className="text-2xl text-gray-400">Carregando...</h2>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl text-red-400">{error}</h2>
        </div>
      </div>
    );
  }

  // No round or voting not started
  if (!round || !round.endedAt) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">⏳</div>
          <h2 className="text-3xl font-bold text-primary mb-4">
            Aguarde a rodada encerrar
          </h2>
          <p className="text-xl text-gray-400">
            A votação será liberada em breve...
          </p>
        </div>
      </div>
    );
  }

  // Voting closed
  if (round.votingStatus === 'closed' || round.votingStatus === 'revealed') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-3xl font-bold text-primary mb-4">
            Votação Encerrada
          </h2>
          <p className="text-xl text-gray-400">
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
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">📭</div>
          <h2 className="text-2xl text-gray-400 mb-2">Nenhuma resposta disponível</h2>
          <p className="text-gray-500">
            Aguarde os participantes completarem suas respostas.
          </p>
          <p className="text-sm text-gray-600 mt-4">
            Atualizando automaticamente...
          </p>
        </div>
      </div>
    );
  }

  const currentResponse = responses[currentIndex];
  const isVoted = votedParticipants.has(currentResponse.participant_id);
  const votedScore = votedParticipants.get(currentResponse.participant_id);
  const votedCount = votedParticipants.size;
  const totalResponses = responses.length;

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
      {/* Header */}
      <header className="mb-4 text-center">
        <h1 className="text-3xl md:text-4xl font-bold text-primary mb-2">
          🗳️ Votação - Rodada {round.index}
        </h1>
        <p className="text-sm md:text-base text-gray-400 mb-2">
          {round.prompt}
        </p>
        <div className="flex justify-center gap-4 text-sm">
          <span className="text-gray-500">
            {currentIndex + 1} de {totalResponses}
          </span>
          <span className="text-primary">
            {votedCount} votados
          </span>
        </div>
      </header>

      {/* Progress dots */}
      <div className="flex justify-center gap-1 mb-4 flex-wrap">
        {responses.map((r, i) => (
          <button
            key={r.participant_id}
            onClick={() => setCurrentIndex(i)}
            className={`w-3 h-3 rounded-full transition-all ${
              i === currentIndex
                ? 'bg-primary scale-125'
                : votedParticipants.has(r.participant_id)
                ? 'bg-green-500'
                : 'bg-gray-600'
            }`}
          />
        ))}
      </div>

      {/* Main card */}
      <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full">
        <div className="flex-1 bg-gray-800 rounded-lg border-2 border-gray-700 flex flex-col overflow-hidden">
          {/* Participant name */}
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-xl font-bold text-primary">
              Resposta de {currentResponse.nickname}
            </h2>
            {isVoted && (
              <span className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-bold">
                Votado: {votedScore}
              </span>
            )}
          </div>

          {/* Response content */}
          <div className="flex-1 p-4 overflow-auto">
            {svgMode && currentResponse.generated_content ? (
              <div
                className="w-full h-full flex items-center justify-center bg-white rounded-lg p-4"
                dangerouslySetInnerHTML={{ __html: currentResponse.generated_content }}
              />
            ) : (
              <div className="whitespace-pre-wrap text-gray-200 font-mono text-sm leading-relaxed">
                {currentResponse.generated_content || '(Sem resposta)'}
              </div>
            )}
          </div>

          {/* Vote buttons */}
          {!isVoted && (
            <div className="p-4 border-t border-gray-700">
              <p className="text-center text-gray-400 mb-3 text-sm">
                Dê sua nota (0 = ruim, 5 = excelente)
              </p>
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => handleVote(score)}
                    className="flex-1 py-4 rounded-lg text-xl font-bold bg-gray-700 text-gray-300
                               hover:bg-primary hover:text-white active:scale-95 transition-all"
                  >
                    {score}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex justify-between mt-4 gap-4">
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className={`flex-1 py-3 rounded-lg font-bold transition-all ${
              currentIndex === 0
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            ← Anterior
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex === responses.length - 1}
            className={`flex-1 py-3 rounded-lg font-bold transition-all ${
              currentIndex === responses.length - 1
                ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                : 'bg-gray-700 text-white hover:bg-gray-600'
            }`}
          >
            Próximo →
          </button>
        </div>
      </div>

      {/* Completion message */}
      {votedCount === totalResponses && (
        <div className="mt-4 text-center">
          <div className="bg-green-500/20 text-green-400 px-6 py-3 rounded-lg inline-block">
            ✅ Você votou em todas as respostas! Obrigado por participar!
          </div>
        </div>
      )}
    </div>
  );
}

export default Voting;
