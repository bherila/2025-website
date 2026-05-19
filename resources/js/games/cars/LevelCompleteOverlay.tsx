import { ArrowRight, RotateCcw, Sparkles, Trophy } from 'lucide-react'
import { type CSSProperties, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'

import { labelForPowerUp } from './gameEngine'
import { type CompletedLevel, type GameState } from './gameEngine'

export interface LevelCompleteOverlayProps {
  state: Pick<GameState, 'completedLevel'>
  onNextLevel: () => void
  onRestart: () => void
}

type ConfettiStyle = CSSProperties & {
  '--cars-confetti-delay': string
  '--cars-confetti-drift': string
  '--cars-confetti-rotation': string
  '--cars-confetti-x': string
}

const CONFETTI_COLORS = ['bg-emerald-400', 'bg-sky-400', 'bg-amber-300', 'bg-rose-400', 'bg-violet-400', 'bg-cyan-300'] as const
const CONFETTI_PIECES = Array.from({ length: 36 }, (_, index) => {
  const column = index % 12
  const row = Math.floor(index / 12)
  const x = 8 + column * 7 + (row % 2) * 2
  const drift = ((index * 29) % 72) - 36
  const rotation = ((index * 53) % 300) - 150

  return {
    colorClass: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    id: `confetti-${index}`,
    roundedClass: index % 3 === 0 ? 'rounded-full' : 'rounded-[2px]',
    style: {
      '--cars-confetti-delay': `${(index % 9) * 80}ms`,
      '--cars-confetti-drift': `${drift}px`,
      '--cars-confetti-rotation': `${rotation}deg`,
      '--cars-confetti-x': `${x}%`,
    } as ConfettiStyle,
    wideClass: index % 4 === 0 ? 'w-2.5' : 'w-1.5',
  }
})

export function LevelCompleteOverlay({ state, onNextLevel, onRestart }: LevelCompleteOverlayProps): ReactElement | null {
  if (!state.completedLevel) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3 pb-24 pt-6 sm:p-6" role="dialog" aria-labelledby="cars-level-complete-title">
      <style>{`
        @keyframes cars-level-complete-enter {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.96);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes cars-confetti-fall {
          0% {
            opacity: 0;
            transform: translate3d(var(--cars-confetti-x), -2rem, 0) rotate(0deg);
          }

          12% {
            opacity: 1;
          }

          100% {
            opacity: 0;
            transform: translate3d(calc(var(--cars-confetti-x) + var(--cars-confetti-drift)), 19rem, 0) rotate(var(--cars-confetti-rotation));
          }
        }

        .cars-level-complete-card {
          animation: cars-level-complete-enter 260ms ease-out both;
        }

        .cars-confetti-piece {
          animation: cars-confetti-fall 1100ms cubic-bezier(0.21, 0.61, 0.35, 1) var(--cars-confetti-delay) both;
        }

        @media (prefers-reduced-motion: reduce) {
          .cars-level-complete-card,
          .cars-confetti-piece {
            animation: none;
          }

          .cars-confetti-piece {
            opacity: 0.55;
            transform: translate3d(var(--cars-confetti-x), 2rem, 0);
          }
        }
      `}</style>

      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] dark:bg-slate-950/45" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 overflow-hidden" aria-hidden="true">
        {CONFETTI_PIECES.map((piece) => (
          <div
            className={`cars-confetti-piece absolute top-0 h-3 ${piece.wideClass} ${piece.roundedClass} ${piece.colorClass} shadow-sm`}
            key={piece.id}
            style={piece.style}
          />
        ))}
      </div>

      <div className="cars-level-complete-card pointer-events-auto relative w-full max-w-md overflow-hidden rounded-lg border border-emerald-200 bg-white/95 p-5 text-center shadow-2xl shadow-slate-950/25 sm:p-6 dark:border-emerald-900 dark:bg-slate-950/95">
        <div className="absolute right-4 top-4 text-amber-400" aria-hidden="true">
          <Sparkles className="size-5" />
        </div>
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 ring-8 ring-emerald-100/45 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900/25">
          <Trophy className="size-7" />
        </div>

        <LevelCompleteSummary completedLevel={state.completedLevel} />

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button className="h-11 sm:col-start-2" type="button" onClick={onNextLevel}>
            Next Level
            <ArrowRight className="size-4" />
          </Button>
          <Button className="h-11 sm:col-start-1 sm:row-start-1" type="button" variant="outline" onClick={onRestart}>
            <RotateCcw className="size-4" />
            Restart Level
          </Button>
        </div>
      </div>
    </div>
  )
}

function LevelCompleteSummary({ completedLevel }: { completedLevel: CompletedLevel }): ReactElement {
  return (
    <>
      <h2 className="text-2xl font-bold tracking-normal text-slate-950 dark:text-slate-50" id="cars-level-complete-title">
        Level {completedLevel.level} Complete
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-2 text-left">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Score</div>
          <div className="mt-1 text-lg font-bold tabular-nums text-slate-950 dark:text-slate-50">{completedLevel.score.toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Power-up</div>
          <div className="mt-1 text-lg font-bold text-slate-950 dark:text-slate-50">{labelForPowerUp(completedLevel.awardedPowerUp)}</div>
        </div>
      </div>
    </>
  )
}
