import React, { useState } from 'react';

import type { AiConfigUsage } from './types';

interface UsageDisplayProps {
  usage: AiConfigUsage;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export const UsageDisplay: React.FC<UsageDisplayProps> = ({ usage }) => {
  const [period, setPeriod] = useState<'this_month' | 'total'>('this_month');

  const current = usage[period];
  const totalTokens = current.input_tokens + current.output_tokens;
  const hasUsage = totalTokens > 0;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        {hasUsage ? (
          <>
            <span className="font-medium text-foreground">{formatTokens(totalTokens)}</span>
            {' tokens '}
            <span className="text-muted-foreground/70">
              ({formatTokens(current.input_tokens)} in / {formatTokens(current.output_tokens)} out)
            </span>
          </>
        ) : (
          <span>No usage</span>
        )}
      </span>
      <div className="flex rounded border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setPeriod('this_month')}
          className={`px-1.5 py-0.5 text-xs transition-colors ${
            period === 'this_month'
              ? 'bg-muted text-foreground font-medium'
              : 'hover:bg-muted/50'
          }`}
        >
          This month
        </button>
        <button
          type="button"
          onClick={() => setPeriod('total')}
          className={`px-1.5 py-0.5 text-xs transition-colors border-l border-border ${
            period === 'total'
              ? 'bg-muted text-foreground font-medium'
              : 'hover:bg-muted/50'
          }`}
        >
          Total
        </button>
      </div>
    </div>
  );
};
