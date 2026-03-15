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

        if (scoreRes.status === 429 || roundRes.status === 429) {
          console.warn('[Scoreboard] Rate limited, backing off');
          return;
        }

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
    const interval = setInterval(fetchScoreboard, 5000);

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

  const getMedalClass = (position: number) => {
    switch (position) {
      case 0:
        return 'medal medal-gold';
      case 1:
        return 'medal medal-silver';
      case 2:
        return 'medal medal-bronze';
      default:
        return '';
    }
  };

  const getPositionClass = (position: number) => {
    switch (position) {
      case 0:
        return 'border-[#FFD700] bg-gradient-to-br from-[#FFD700]/20 to-transparent shadow-[0_0_30px_rgba(255,215,0,0.3)]';
      case 1:
        return 'border-[#C0C0C0] bg-gradient-to-br from-[#C0C0C0]/20 to-transparent shadow-[0_0_20px_rgba(192,192,192,0.3)]';
      case 2:
        return 'border-[#CD7F32] bg-gradient-to-br from-[#CD7F32]/20 to-transparent shadow-[0_0_20px_rgba(205,127,50,0.3)]';
      default:
        return 'border-[var(--color-surface-light)] bg-[var(--color-surface)]/50';
    }
  };

  const getBarGradient = (position: number) => {
    switch (position) {
      case 0:
        return 'bg-gradient-to-r from-[#FFD700] to-[#FFA500]';
      case 1:
        return 'bg-gradient-to-r from-[#E8E8E8] to-[#B8B8B8]';
      case 2:
        return 'bg-gradient-to-r from-[#CD7F32] to-[#8B4513]';
      default:
        return 'bg-gradient-to-r from-[var(--color-neon-orange)] to-[var(--color-neon-pink)]';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-6xl mb-4 animate-spin-slow">⚡</div>
          <h2 className="text-2xl font-mono font-bold text-neon-orange tracking-wider">
            Carregando placar...
          </h2>
        </div>
      </div>
    );
  }

  if (!data || data.scoreboard.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="text-8xl mb-6 animate-float">📊</div>
          <h2 className="text-3xl font-mono font-bold text-gray-400 mb-2">
            Nenhum resultado disponível
          </h2>
          <p className="text-gray-500 font-body">
            Aguarde a conclusão da rodada...
          </p>
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
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center animate-fade-in">
          <div className="text-9xl mb-8 animate-float">🏆</div>
          <h1 className="text-6xl font-mono font-black text-neon-yellow tracking-wider mb-6 glitch">
            PREMIAÇÃO
          </h1>
          {roundInfo && (
            <div className="mb-6">
              <span className="px-4 py-2 bg-[var(--color-neon-purple)]/20 border border-[var(--color-neon-purple)] rounded-lg font-mono font-bold text-[var(--color-neon-purple)] text-xl uppercase tracking-wider">
                Rodada {roundInfo.index}
              </span>
            </div>
          )}
          <p className="text-2xl text-gray-400 font-body animate-pulse">
            Aguardando revelação dos resultados...
          </p>
          <div className="mt-8 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-4 h-4 rounded-full bg-[var(--color-neon-orange)] animate-pulse"
                style={{ animationDelay: `${i * 200}ms` }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // State: All revealed - Final results with chart
  if (isRevealMode && allRevealed) {
    const maxScore = 5;

    return (
      <div className="min-h-screen text-white p-6 lg:p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center animate-fade-in">
            <h1 className="text-5xl lg:text-6xl font-mono font-black text-neon-yellow tracking-wider mb-4 glitch">
              🏆 RESULTADOS FINAIS
            </h1>
            {roundInfo && (
              <div className="space-y-2">
                <span className="inline-block px-4 py-2 bg-[var(--color-neon-purple)]/20 border border-[var(--color-neon-purple)] rounded-lg font-mono font-bold text-[var(--color-neon-purple)] uppercase tracking-wider">
                  Rodada {roundInfo.index}
                </span>
                <p className="text-lg text-gray-400 font-body italic max-w-2xl mx-auto">
                  "{roundInfo.prompt}"
                </p>
              </div>
            )}
          </div>

          {/* Horizontal Bar Chart */}
          <div className="arcade-card rounded-xl p-6 mb-8 animate-fade-in-up">
            <h2 className="text-2xl font-mono font-bold text-neon-cyan text-center mb-6 tracking-wider">
              MÉDIA DE VOTOS (0-5)
            </h2>
            <div className="space-y-4">
              {scoreboard.map((participant, index) => (
                <div
                  key={participant.participant_id}
                  className={`flex items-center gap-4 animate-slide-in-left stagger-${Math.min(index + 1, 6)}`}
                  style={{ opacity: 0 }}
                >
                  <div className="w-10 text-2xl text-center">
                    {index < 3 ? getMedalEmoji(index) : <span className="text-gray-500 font-mono font-bold">{index + 1}º</span>}
                  </div>
                  <div className="w-28 lg:w-36 font-mono font-bold truncate text-right text-gray-200">
                    {participant.nickname}
                  </div>
                  <div className="flex-1 h-10 bg-[var(--color-midnight)] rounded border-2 border-[var(--color-surface-light)] overflow-hidden">
                    <div
                      className={`h-full ${getBarGradient(index)} transition-all duration-1000 ease-out flex items-center justify-end pr-3`}
                      style={{ width: `${Math.max((participant.avg_score / maxScore) * 100, 10)}%` }}
                    >
                      <span className="text-[var(--color-deep-blue)] font-mono font-bold text-sm drop-shadow">
                        {participant.avg_score.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="w-24 text-right text-gray-500 text-sm font-mono">
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
                className={`arcade-card border-2 rounded-xl p-6 transition-all animate-bounce-in ${getPositionClass(index)} ${
                  index === 0 ? 'md:order-2 md:scale-105' : index === 1 ? 'md:order-1' : 'md:order-3'
                }`}
                style={{ animationDelay: `${(2 - index) * 200}ms`, opacity: 0 }}
              >
                <div className="text-center">
                  <div className={`${getMedalClass(index)} mx-auto mb-3`}>
                    {getMedalEmoji(index)}
                  </div>
                  <div className="text-2xl lg:text-3xl font-mono font-bold mb-2 text-gray-100">
                    {participant.nickname}
                  </div>
                  <div className="text-4xl lg:text-5xl font-mono font-black text-neon-cyan mb-2">
                    {participant.avg_score.toFixed(2)}
                  </div>
                  <div className="text-gray-500 text-sm font-mono">
                    {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                  </div>
                </div>

                {/* Response Preview */}
                {participant.generated_content && (
                  <div className="mt-4 pt-4 border-t border-[var(--color-surface-light)]">
                    {svgMode ? (
                      <div
                        className="w-full bg-white rounded-lg p-2 max-h-48 overflow-hidden"
                        dangerouslySetInnerHTML={{ __html: participant.generated_content }}
                      />
                    ) : (
                      <div className="text-sm text-gray-400 font-mono whitespace-pre-wrap max-h-32 overflow-hidden bg-[var(--color-midnight)] p-3 rounded">
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
          {scoreboard.length > 3 && (
            <div className="space-y-3">
              {scoreboard.slice(3).map((participant, idx) => {
                const position = idx + 3;
                return (
                  <div
                    key={participant.participant_id}
                    className={`arcade-card border-2 rounded-lg p-4 animate-fade-in ${getPositionClass(position)}`}
                    style={{ animationDelay: `${(idx + 4) * 100}ms`, opacity: 0 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-2xl font-mono font-bold w-14 text-center text-gray-500">
                        {position + 1}º
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-mono font-bold text-gray-200">{participant.nickname}</h3>
                        {participant.generated_content && !svgMode && (
                          <p className="text-sm text-gray-500 font-mono truncate">
                            {participant.generated_content.slice(0, 100)}...
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-mono font-bold text-neon-cyan">
                          {participant.avg_score.toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500 font-mono">
                          {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 text-center">
            <p className="font-mono text-gray-600 tracking-wider">
              GAMBIARRA LLM CLUB ARENA
            </p>
          </div>
        </div>
      </div>
    );
  }

  // State: Reveal mode - showing revealed positions (last to first)
  if (isRevealMode && revealedCount > 0) {
    return (
      <div className="min-h-screen text-white p-6 lg:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8 text-center animate-fade-in">
            <h1 className="text-5xl lg:text-6xl font-mono font-black text-neon-yellow tracking-wider mb-4">
              🏆 PREMIAÇÃO
            </h1>
            {roundInfo && (
              <span className="inline-block px-4 py-2 bg-[var(--color-neon-purple)]/20 border border-[var(--color-neon-purple)] rounded-lg font-mono font-bold text-[var(--color-neon-purple)] uppercase tracking-wider mb-4">
                Rodada {roundInfo.index}
              </span>
            )}
            <div className="flex items-center justify-center gap-4 text-lg">
              <span className="text-gray-500 font-mono">Revelados:</span>
              <span className="text-neon-cyan font-mono font-bold text-2xl">{revealedCount}</span>
              <span className="text-gray-600">/</span>
              <span className="text-gray-400 font-mono">{totalParticipants}</span>
            </div>
          </div>

          {/* Revealed Participants (from last to most recent) */}
          <div className="space-y-6">
            {revealedParticipants.map((participant, revealIndex) => {
              // Find actual position (1-indexed)
              const position = scoreboard.findIndex(p => p.participant_id === participant.participant_id);
              const displayPosition = position + 1;
              const isPodium = position < 3;

              return (
                <div
                  key={participant.participant_id}
                  className={`arcade-card border-2 rounded-xl p-6 transition-all animate-fade-in-up ${
                    isPodium ? getPositionClass(position) : ''
                  }`}
                  style={{ animationDelay: `${revealIndex * 150}ms`, opacity: 0 }}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                    {/* Position Badge */}
                    <div className="flex lg:flex-col items-center gap-4 lg:gap-2">
                      {isPodium ? (
                        <div className={`${getMedalClass(position)}`}>
                          {getMedalEmoji(position)}
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-[var(--color-surface)] border-2 border-[var(--color-surface-light)] flex items-center justify-center">
                          <span className="text-2xl font-mono font-bold text-gray-400">
                            {displayPosition}º
                          </span>
                        </div>
                      )}
                      {isPodium && (
                        <span className="text-3xl font-mono font-bold text-gray-300">{displayPosition}º</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1">
                      <h2 className={`text-3xl lg:text-4xl font-mono font-bold mb-3 ${
                        isPodium ? 'text-white' : 'text-gray-200'
                      }`}>
                        {participant.nickname}
                      </h2>

                      <div className="flex flex-wrap items-center gap-4 lg:gap-6 mb-4">
                        <div className="flex items-baseline gap-2">
                          <span className="text-4xl lg:text-5xl font-mono font-black text-neon-cyan">
                            {participant.avg_score.toFixed(2)}
                          </span>
                          <span className="text-gray-500 font-body">média</span>
                        </div>
                        <div className="px-3 py-1 bg-[var(--color-surface)] rounded-lg">
                          <span className="text-gray-400 font-mono">
                            {participant.votes} voto{participant.votes !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-gray-600 text-sm font-mono hidden lg:block">
                          {participant.tokens} tokens | {participant.tps_avg.toFixed(1)} TPS
                        </div>
                      </div>

                      {/* Response Content */}
                      {participant.generated_content && (
                        <div className="bg-[var(--color-midnight)] rounded-lg p-4 border border-[var(--color-surface-light)]">
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
            <div className="mt-10 text-center">
              <div className="inline-flex items-center gap-3 px-6 py-3 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg">
                <span className="text-2xl animate-pulse">👀</span>
                <span className="text-xl text-gray-400 font-mono">
                  Próximo: <span className="text-neon-yellow font-bold">{totalParticipants - revealedCount}º lugar</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // State: Normal scoreboard (votingStatus !== 'revealed')
  // Sort participants alphabetically for suspense mode (hide rankings)
  const sortedByName = [...scoreboard].sort((a, b) => a.nickname.localeCompare(b.nickname));
  const totalVotes = scoreboard.reduce((sum, p) => sum + p.votes, 0);

  return (
    <div className="min-h-screen text-white p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center animate-fade-in">
          <h1 className="text-4xl lg:text-5xl font-mono font-bold tracking-wider mb-4">
            {votingStatus === 'open' ? (
              <span className="text-neon-cyan">🗳️ VOTAÇÃO EM ANDAMENTO</span>
            ) : (
              <span className="text-neon-yellow">⏳ AGUARDANDO PREMIAÇÃO</span>
            )}
          </h1>
          {roundInfo && (
            <div className="space-y-2">
              <span className="inline-block px-4 py-2 bg-[var(--color-neon-purple)]/20 border border-[var(--color-neon-purple)] rounded-lg font-mono font-bold text-[var(--color-neon-purple)] uppercase tracking-wider">
                Rodada {roundInfo.index}
              </span>
              <p className="text-lg text-gray-400 font-body italic max-w-2xl mx-auto">
                "{roundInfo.prompt}"
              </p>
            </div>
          )}

          {/* Total votes counter */}
          <div className="mt-8 inline-flex items-center gap-4 arcade-card px-8 py-5 rounded-xl">
            <span className="text-5xl animate-float">🗳️</span>
            <div className="text-left">
              <div className="text-5xl lg:text-6xl font-mono font-black text-neon-orange animate-counter-up">
                {totalVotes}
              </div>
              <div className="text-gray-400 font-body">
                voto{totalVotes !== 1 ? 's' : ''} recebido{totalVotes !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* Participants with vote counts only (no scores revealed) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedByName.map((participant, index) => (
            <div
              key={participant.participant_id}
              className={`arcade-card rounded-xl p-6 transition-all hover:scale-[1.02] animate-fade-in-up stagger-${Math.min(index + 1, 6)}`}
              style={{ opacity: 0 }}
            >
              <div className="text-center">
                {/* Avatar */}
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[var(--color-neon-orange)] to-[var(--color-neon-pink)] flex items-center justify-center text-2xl font-display font-bold text-[var(--color-deep-blue)] mx-auto mb-3">
                  {participant.nickname.charAt(0).toUpperCase()}
                </div>

                {/* Nickname */}
                <h3 className="text-xl font-mono font-bold text-gray-100 mb-4 tracking-wide">
                  {participant.nickname}
                </h3>

                {/* Vote count with animation */}
                <div className="flex items-center justify-center gap-3">
                  <div className={`text-5xl font-mono font-black transition-all ${
                    participant.votes > 0 ? 'text-neon-cyan' : 'text-gray-700'
                  }`}>
                    {participant.votes}
                  </div>
                  <div className="text-left">
                    <div className="text-gray-500 font-body text-sm">
                      voto{participant.votes !== 1 ? 's' : ''}
                    </div>
                  </div>
                </div>

                {/* Vote indicator dots */}
                {participant.votes > 0 && participant.votes <= 15 && (
                  <div className="mt-4 flex justify-center flex-wrap gap-1.5">
                    {Array.from({ length: participant.votes }).map((_, i) => (
                      <div
                        key={i}
                        className="w-2.5 h-2.5 rounded-full bg-[var(--color-neon-orange)] animate-pulse"
                        style={{ animationDelay: `${i * 100}ms` }}
                      />
                    ))}
                  </div>
                )}
                {participant.votes > 15 && (
                  <div className="mt-4">
                    <span className="px-3 py-1 bg-[var(--color-neon-orange)]/20 border border-[var(--color-neon-orange)] rounded text-[var(--color-neon-orange)] text-sm font-display font-semibold">
                      🔥 Muitos votos!
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Suspense message */}
        <div className="mt-12 text-center">
          {votingStatus === 'open' ? (
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-[var(--color-surface)] border border-[var(--color-surface-light)] rounded-lg animate-pulse">
              <span className="text-xl">🤫</span>
              <span className="text-lg text-gray-400 font-body">
                Os resultados serão revelados quando a votação encerrar...
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-3 px-6 py-3 bg-[var(--color-neon-yellow)]/10 border border-[var(--color-neon-yellow)] rounded-lg animate-pulse">
              <span className="text-xl">⏳</span>
              <span className="text-lg text-[var(--color-neon-yellow)] font-mono font-semibold">
                Aguardando o admin iniciar a premiação...
              </span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="font-mono text-gray-600 tracking-wider text-sm">
            GAMBIARRA LLM CLUB ARENA
          </p>
          <p className="mt-2 text-gray-700 text-xs font-mono">
            Atualização automática a cada 5s
          </p>
        </div>
      </div>
    </div>
  );
}
