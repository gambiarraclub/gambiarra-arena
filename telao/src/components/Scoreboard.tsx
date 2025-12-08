import { useState, useEffect } from 'react';

interface ParticipantScore {
  participant_id: string;
  nickname: string;
  votes: number;
  avg_score: number;
  total_score: number;
  tokens: number;
  tps_avg: number;
  latency_first_token_ms: number | null;
  duration_ms: number;
  generated_content: string | null;
}

interface ScoreboardData {
  scoreboard: ParticipantScore[];
  svgMode: boolean;
  votingStatus: string;
  revealedCount: number;
}

interface RoundInfo {
  index: number;
  prompt: string;
}

export default function Scoreboard() {
  const [data, setData] = useState<ScoreboardData | null>(null);
  const [roundInfo, setRoundInfo] = useState<RoundInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchScoreboard = async () => {
      try {
        const [scoreRes, roundRes] = await Promise.all([
          fetch('/api/scoreboard'),
          fetch('/api/rounds/current'),
        ]);

        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          setData(scoreData);
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
    const interval = setInterval(fetchScoreboard, 2000);

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
        return 'bg-yellow-500/30 border-yellow-500 shadow-yellow-500/30';
      case 1:
        return 'bg-gray-400/30 border-gray-400 shadow-gray-400/30';
      case 2:
        return 'bg-orange-600/30 border-orange-600 shadow-orange-600/30';
      default:
        return 'bg-purple-500/10 border-purple-500/30';
    }
  };

  const getBarColor = (position: number) => {
    switch (position) {
      case 0:
        return 'bg-yellow-500';
      case 1:
        return 'bg-gray-400';
      case 2:
        return 'bg-orange-500';
      default:
        return 'bg-primary';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-white text-2xl animate-pulse">Carregando placar...</div>
      </div>
    );
  }

  if (!data || data.scoreboard.length === 0) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-pulse">📊</div>
          <h2 className="text-2xl text-gray-400">Nenhum resultado disponível ainda</h2>
        </div>
      </div>
    );
  }

  const { scoreboard, svgMode, votingStatus, revealedCount } = data;
  const totalParticipants = scoreboard.length;
  const isRevealMode = votingStatus === 'revealed';
  const allRevealed = revealedCount >= totalParticipants;

  // Calculate revealed positions (from last to first)
  // If revealedCount = 2 and total = 5, we show positions 5 and 4 (indices 4 and 3)
  const getRevealedParticipants = () => {
    if (!isRevealMode || revealedCount === 0) return [];
    // Scoreboard is sorted by avg_score descending (index 0 = 1st place)
    // We reveal from last place to first
    const startIndex = totalParticipants - revealedCount;
    return scoreboard.slice(startIndex).reverse();
  };

  const revealedParticipants = getRevealedParticipants();

  // State: Reveal mode but waiting for first reveal
  if (isRevealMode && revealedCount === 0) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center p-8">
        <div className="text-center">
          <div className="text-8xl mb-6 animate-bounce">🏆</div>
          <h1 className="text-5xl font-bold text-primary mb-4">
            PREMIAÇÃO
          </h1>
          {roundInfo && (
            <p className="text-2xl text-gray-400 mb-4">Rodada {roundInfo.index}</p>
          )}
          <p className="text-xl text-gray-500 animate-pulse">
            Aguardando revelação dos resultados...
          </p>
        </div>
      </div>
    );
  }

  // State: All revealed - Final results with chart
  if (isRevealMode && allRevealed) {
    const maxScore = 5;

    return (
      <div className="min-h-screen bg-dark text-white p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-5xl font-bold mb-4 text-primary">
              🏆 RESULTADOS FINAIS
            </h1>
            {roundInfo && (
              <div className="text-gray-400">
                <p className="text-xl mb-2">Rodada {roundInfo.index}</p>
                <p className="text-lg italic">"{roundInfo.prompt}"</p>
              </div>
            )}
          </div>

          {/* Horizontal Bar Chart */}
          <div className="bg-gray-800/50 rounded-xl p-6 mb-8 border border-gray-700">
            <h2 className="text-2xl font-bold mb-6 text-center">Média de Votos (0-5)</h2>
            <div className="space-y-4">
              {scoreboard.map((participant, index) => (
                <div key={participant.participant_id} className="flex items-center gap-4">
                  <div className="w-8 text-2xl text-center">
                    {getMedalEmoji(index) || `${index + 1}º`}
                  </div>
                  <div className="w-32 font-bold truncate text-right">
                    {participant.nickname}
                  </div>
                  <div className="flex-1 h-8 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getBarColor(index)} transition-all duration-1000 ease-out flex items-center justify-end pr-3`}
                      style={{ width: `${(participant.avg_score / maxScore) * 100}%` }}
                    >
                      <span className="text-white font-bold text-sm drop-shadow">
                        {participant.avg_score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="w-20 text-right text-gray-400 text-sm">
                    {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Podium - Top 3 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {scoreboard.slice(0, 3).map((participant, index) => (
              <div
                key={participant.participant_id}
                className={`border-2 rounded-xl p-6 transition-all shadow-lg ${getPositionClass(index)} ${
                  index === 0 ? 'md:order-2 md:scale-105' : index === 1 ? 'md:order-1' : 'md:order-3'
                }`}
              >
                <div className="text-center">
                  <div className="text-6xl mb-2">{getMedalEmoji(index)}</div>
                  <div className="text-3xl font-bold mb-1">{participant.nickname}</div>
                  <div className="text-4xl font-bold text-primary mb-2">
                    {participant.avg_score.toFixed(2)}
                  </div>
                  <div className="text-gray-400 text-sm">
                    {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Response Preview */}
                {participant.generated_content && (
                  <div className="mt-4 border-t border-gray-600 pt-4">
                    {svgMode ? (
                      <div
                        className="w-full bg-white rounded-lg p-2 max-h-48 overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: participant.generated_content }}
                      />
                    ) : (
                      <div className="text-sm text-gray-300 font-mono whitespace-pre-wrap max-h-32 overflow-hidden">
                        {participant.generated_content.slice(0, 300)}
                        {participant.generated_content.length > 300 && '...'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Full Results List */}
          <div className="space-y-4">
            {scoreboard.slice(3).map((participant, idx) => {
              const position = idx + 3;
              return (
                <div
                  key={participant.participant_id}
                  className={`border-2 rounded-lg p-4 ${getPositionClass(position)}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold w-12 text-center">
                      {position + 1}º
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold">{participant.nickname}</h3>
                      {participant.generated_content && !svgMode && (
                        <p className="text-sm text-gray-400 font-mono truncate">
                          {participant.generated_content.slice(0, 100)}...
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {participant.avg_score.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400">
                        {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="mt-12 text-center text-gray-500 text-sm">
            <p>🎮 Gambiarra LLM Club Arena Local</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Reveal mode - showing revealed positions (last to first)
  if (isRevealMode && revealedCount > 0) {
    return (
      <div className="min-h-screen bg-dark text-white p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center">
            <h1 className="text-5xl font-bold mb-4 text-primary">
              🏆 PREMIAÇÃO
            </h1>
            {roundInfo && (
              <p className="text-xl text-gray-400 mb-2">Rodada {roundInfo.index}</p>
            )}
            <div className="text-lg text-gray-500">
              Revelados: {revealedCount} de {totalParticipants}
            </div>
          </div>

          {/* Revealed Participants (from last to most recent) */}
          <div className="space-y-6">
            {revealedParticipants.map((participant) => {
              // Find actual position (1-indexed)
              const position = scoreboard.findIndex(p => p.participant_id === participant.participant_id);
              const displayPosition = position + 1;
              const isPodium = position < 3;

              return (
                <div
                  key={participant.participant_id}
                  className={`border-2 rounded-xl p-6 transition-all animate-fade-in ${
                    isPodium ? getPositionClass(position) + ' shadow-lg' : 'bg-gray-800/50 border-gray-700'
                  }`}
                >
                  <div className="flex items-start gap-6">
                    {/* Position */}
                    <div className="text-center">
                      <div className="text-5xl mb-1">
                        {getMedalEmoji(position) || ''}
                      </div>
                      <div className={`text-4xl font-bold ${isPodium ? 'text-white' : 'text-gray-400'}`}>
                        {displayPosition}º
                      </div>
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <h2 className={`text-3xl font-bold mb-2 ${isPodium ? 'text-white' : 'text-gray-200'}`}>
                        {participant.nickname}
                      </h2>

                      <div className="flex items-center gap-6 mb-4">
                        <div>
                          <span className="text-4xl font-bold text-primary">
                            {participant.avg_score.toFixed(2)}
                          </span>
                          <span className="text-gray-400 ml-2">média</span>
                        </div>
                        <div className="text-gray-400">
                          {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                        </div>
                        <div className="text-gray-500 text-sm">
                          {participant.tokens} tokens | {participant.tps_avg.toFixed(1)} TPS
                        </div>
                      </div>

                      {/* Response Content */}
                      {participant.generated_content && (
                        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                          {svgMode ? (
                            <div
                              className="w-full bg-white rounded-lg p-4 max-h-64 overflow-auto"
                              dangerouslySetInnerHTML={{ __html: participant.generated_content }}
                            />
                          ) : (
                            <div className="text-gray-300 font-mono text-sm whitespace-pre-wrap max-h-48 overflow-auto">
                              {participant.generated_content}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Next reveal hint */}
          {revealedCount < totalParticipants && (
            <div className="mt-8 text-center">
              <div className="text-2xl text-gray-500 animate-pulse">
                Próximo: {totalParticipants - revealedCount}º lugar...
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // State: Normal scoreboard (votingStatus !== 'revealed')
  return (
    <div className="min-h-screen bg-dark text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-5xl font-bold mb-4 text-primary">
            📊 Placar
          </h1>
          {roundInfo && (
            <div className="text-gray-400">
              <p className="text-xl mb-2">Rodada {roundInfo.index}</p>
              <p className="text-lg italic">"{roundInfo.prompt}"</p>
            </div>
          )}
          {votingStatus === 'open' && (
            <div className="mt-4 inline-block bg-green-500/20 text-green-400 px-4 py-2 rounded-full">
              🗳️ Votação em andamento
            </div>
          )}
        </div>

        {/* Scoreboard */}
        <div className="space-y-4">
          {scoreboard.map((participant, index) => (
            <div
              key={participant.participant_id}
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
                  </div>
                </div>

                {/* Scores */}
                <div className="grid grid-cols-2 gap-8 text-center">
                  {/* Vote Statistics */}
                  <div>
                    <div className="text-3xl font-bold text-primary">
                      {participant.avg_score.toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-400">Média</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                    </div>
                  </div>

                  {/* Performance Metrics */}
                  <div>
                    <div className="text-2xl font-bold text-secondary">
                      {participant.tokens} tokens
                    </div>
                    <div className="text-sm text-gray-400">
                      {participant.tps_avg.toFixed(1)} TPS
                    </div>
                  </div>
                </div>
              </div>

              {/* Progress bar showing average score */}
              <div className="mt-4 bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-500"
                  style={{ width: `${(participant.avg_score / 5) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-500 text-sm">
          <p>🎮 Gambiarra LLM Club Arena Local</p>
          <p className="mt-2">Atualização automática a cada 2 segundos</p>
        </div>
      </div>
    </div>
  );
}
