import { useState, useEffect } from 'react';

interface ParticipantScore {
  participantId: string;
  nickname: string;
  voteCount: number;
  averageScore: number;
  totalScore: number;
  tokens: number;
  tokensPerSecond: number;
}

export default function Scoreboard() {
  const [scoreboard, setScoreboard] = useState<ParticipantScore[]>([]);
  const [roundInfo, setRoundInfo] = useState<{ index: number; prompt: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScoreboard = async () => {
      try {
        const [scoreRes, roundRes] = await Promise.all([
          fetch('/api/scoreboard'),
          fetch('/api/rounds/current'),
        ]);

        if (scoreRes.ok) {
          const data = await scoreRes.json();
          setScoreboard(data);
        }

        if (roundRes.ok) {
          const round = await roundRes.json();
          setRoundInfo({ index: round.index, prompt: round.prompt });
        }
      } catch (error) {
        console.error('Erro ao buscar placar:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchScoreboard();
    const interval = setInterval(fetchScoreboard, 3000); // Atualiza a cada 3s

    return () => clearInterval(interval);
  }, []);

  const getMedalEmoji = (position: number) => {
    switch (position) {
      case 0:
        return '🥇';
      case 1:
        return '🥈';
      case 2:
        return '🥉';
      default:
        return '';
    }
  };

  const getPositionClass = (position: number) => {
    switch (position) {
      case 0:
        return 'bg-yellow-500/20 border-yellow-500/50';
      case 1:
        return 'bg-gray-400/20 border-gray-400/50';
      case 2:
        return 'bg-orange-600/20 border-orange-600/50';
      default:
        return 'bg-purple-500/10 border-purple-500/30';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-white text-2xl">Carregando placar...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold mb-4 text-primary">
            🏆 Placar Final
          </h1>
          {roundInfo && (
            <div className="text-gray-400">
              <p className="text-xl mb-2">Rodada {roundInfo.index}</p>
              <p className="text-lg italic">"{roundInfo.prompt}"</p>
            </div>
          )}
        </div>

        {/* Scoreboard */}
        {scoreboard.length === 0 ? (
          <div className="text-center text-gray-400 text-2xl mt-16">
            Nenhum voto registrado ainda
          </div>
        ) : (
          <div className="space-y-4">
            {scoreboard.map((participant, index) => (
              <div
                key={participant.participantId}
                className={`border-2 rounded-lg p-6 transition-all ${getPositionClass(index)}`}
              >
                <div className="flex items-center justify-between">
                  {/* Position and Name */}
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="text-4xl font-bold w-16 text-center">
                      {getMedalEmoji(index)}
                      {!getMedalEmoji(index) && `${index + 1}º`}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold">{participant.nickname}</h3>
                      <p className="text-sm text-gray-400">{participant.participantId}</p>
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="grid grid-cols-2 gap-8 text-center">
                    {/* Vote Statistics */}
                    <div>
                      <div className="text-3xl font-bold text-primary">
                        {participant.averageScore.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400">Média</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {participant.voteCount} voto{participant.voteCount !== 1 ? 's' : ''}
                      </div>
                    </div>

                    {/* Performance Metrics */}
                    <div>
                      <div className="text-2xl font-bold text-secondary">
                        {participant.tokens} tokens
                      </div>
                      <div className="text-sm text-gray-400">
                        {participant.tokensPerSecond.toFixed(1)} TPS
                      </div>
                    </div>
                  </div>

                  {/* Total Score Badge */}
                  <div className="ml-8">
                    <div className="bg-primary/20 border-2 border-primary rounded-full w-24 h-24 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-3xl font-bold">{participant.totalScore}</div>
                        <div className="text-xs text-gray-400">Total</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress bar showing average score */}
                <div className="mt-4 bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-500"
                    style={{ width: `${(participant.averageScore / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>🎮 Gambiarra LLM Club Arena Local</p>
          <p className="mt-2">Atualização automática a cada 3 segundos</p>
        </div>
      </div>
    </div>
  );
}
