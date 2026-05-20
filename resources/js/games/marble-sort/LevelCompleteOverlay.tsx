import { ArrowRight, RotateCcw, Sparkles, Trophy } from 'lucide-react'
import { type ReactElement } from 'react'

import { Button } from '@/components/ui/button'

import { type CompletedLevel, type GameState, labelForPowerUp } from './gameEngine'

interface LevelCompleteOverlayProps {
  state: Pick<GameState, 'completedLevel'>
  onNextLevel: () => void
  onRestart: () => void
}

export function LevelCompleteOverlay({ state, onNextLevel, onRestart }: LevelCompleteOverlayProps): ReactElement | null {
  if (!state.completedLevel) {
    return null
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-3 pb-24 pt-6 sm:p-6" role="dialog" aria-labelledby="marble-sort-level-complete-title">
      <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] dark:bg-slate-950/45" />
      <div className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-lg border border-emerald-200 bg-white/95 p-5 text-center shadow-2xl shadow-slate-950/25 sm:p-6 dark:border-emerald-900 dark:bg-slate-950/95">
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
      <h2 className="text-2xl font-bold tracking-normal text-slate-950 dark:text-slate-50" id="marble-sort-level-complete-title">
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
