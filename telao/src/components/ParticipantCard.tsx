import { memo } from 'react';
import SvgRenderer from './SvgRenderer';

interface Participant {
  id: string;
  nickname: string;
  runner: string;
  model: string;
}

interface ParticipantCardProps {
  participant: Participant;
  tokens: number;
  maxTokens: number;
  isGenerating: boolean;
  content: string;
  svgMode?: boolean;
  ttftMs?: number;
  tps?: number;
  durationMs?: number;
}

function ParticipantCard({
  participant,
  tokens,
  maxTokens,
  isGenerating,
  content,
  svgMode = false,
  ttftMs,
  tps,
  durationMs,
}: ParticipantCardProps) {
  const progress = (tokens / maxTokens) * 100;

  return (
    <div className={`arcade-card rounded-lg p-5 transition-all duration-300 hover:scale-[1.02] ${
      isGenerating ? 'animate-pulse-glow' : ''
    }`}>
      {/* Header with nickname and status */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Avatar circle with first letter */}
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--color-neon-orange)] to-[var(--color-neon-pink)] flex items-center justify-center text-xl font-display font-bold text-[var(--color-deep-blue)]">
            {participant.nickname.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="text-xl font-mono font-bold text-neon-orange tracking-wide">
              {participant.nickname}
            </h3>
            <p className="text-xs font-mono text-[var(--color-surface-light)] opacity-70">
              {participant.runner} · {participant.model.split('/').pop()?.substring(0, 15) || participant.model.substring(0, 15)}
            </p>
          </div>
        </div>
        {content && (
          isGenerating ? (
            <div className="live-indicator">
              <span>GERANDO</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-[var(--color-neon-cyan)]/20 border border-[var(--color-neon-cyan)] rounded">
              <div className="w-2 h-2 bg-[var(--color-neon-cyan)] rounded-full"></div>
              <span className="text-xs font-display font-semibold text-[var(--color-neon-cyan)] uppercase tracking-wider">
                Pronto
              </span>
            </div>
          )
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-2 font-mono">
          <span className="text-[var(--color-neon-yellow)] opacity-80">TOKENS</span>
          <span className="text-[var(--color-neon-cyan)] font-semibold">
            {tokens} <span className="opacity-50">/ {maxTokens}</span>
          </span>
        </div>
        <div className="progress-arcade">
          <div
            className="progress-arcade-fill"
            style={{ width: `${Math.min(progress, 100)}%` }}
          ></div>
        </div>
      </div>

      {/* Content area */}
      {content && (
        svgMode ? (
          <div className="mt-3 rounded-lg overflow-hidden border-2 border-[var(--color-surface-light)] bg-white">
            <SvgRenderer content={content} isGenerating={isGenerating} />
          </div>
        ) : (
          <div className="mt-3 p-3 bg-[var(--color-midnight)] rounded-lg border border-[var(--color-surface-light)] max-h-40 overflow-y-auto">
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
              {content}
            </pre>
          </div>
        )
      )}

      {/* No content state */}
      {!content && (
        <div className="mt-3 p-4 bg-[var(--color-midnight)] rounded-lg border border-[var(--color-surface-light)] border-dashed flex items-center justify-center">
          <span className="text-sm text-gray-500 font-mono animate-pulse">
            Aguardando resposta...
          </span>
        </div>
      )}

      {/* Metrics footer - only after completion */}
      {!isGenerating && ttftMs !== undefined && (
        <div className="mt-3 pt-3 border-t border-[var(--color-surface-light)] flex justify-center gap-4 text-xs font-mono">
          <span className="text-[var(--color-neon-cyan)]">
            TTFT: {(ttftMs / 1000).toFixed(2)}s
          </span>
          {tps !== undefined && (
            <span className="text-[var(--color-neon-yellow)]">
              TPS: {tps.toFixed(1)}
            </span>
          )}
          {durationMs !== undefined && (
            <span className="text-[var(--color-neon-orange)]">
              Total: {(durationMs / 1000).toFixed(1)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ParticipantCard);
