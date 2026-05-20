import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { PortraitGameShell } from '../PortraitGameShell'
import { GameControls, type GameStats } from './GameControls'
import {
  advanceToNextLevel,
  applyExtraBeltPowerUp,
  applyMagnetPowerUp,
  applyShufflePowerUp,
  availableConveyorSlots,
  clearLevelSnapshot,
  type GameState,
  loadLevelSnapshot,
  loadProgress,
  openBox,
  processConveyorTick,
  progressFromState,
  remainingChuteBoxes,
  remainingSortingBlocks,
  restartLevel,
  saveLevelSnapshot,
  saveProgress,
  startGameFromProgress,
} from './gameEngine'
import { LevelCompleteOverlay } from './LevelCompleteOverlay'
import { MarbleSortScene } from './MarbleSortScene'
import { CONVEYOR_TICK_INTERVAL_MS } from './scene/conveyorProgress'
import { shouldShowMarbleSortTutorial, TutorialOverlay } from './TutorialOverlay'

const COLORBLIND_MODE_STORAGE_KEY = 'bwh.marble-sort.colorblind.v1'

export function MarbleSortGame(): ReactElement {
  const [state, setState] = useState<GameState>(() => {
    const progress = loadProgress()

    return loadLevelSnapshot(undefined, progress) ?? startGameFromProgress(progress)
  })
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(() => shouldShowMarbleSortTutorial())
  const [colorblindMode, setColorblindMode] = useState(() => loadColorblindMode())

  useEffect(() => {
    saveProgress(progressFromState(state))
    if (state.completedLevel) {
      clearLevelSnapshot()
      return
    }

    saveLevelSnapshot(state)
  }, [state])

  useEffect(() => {
    if (state.completedLevel || state.gameOver || (state.conveyor.length === 0 && state.fallingMarbles.length === 0)) {
      return
    }

    const interval = window.setInterval(() => {
      setState((current) => processConveyorTick(current))
    }, CONVEYOR_TICK_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [state.completedLevel, state.conveyor.length, state.fallingMarbles.length, state.gameOver])

  const stats = useMemo<GameStats>(() => ({
    boxCount: state.boxes.length,
    chuteBoxes: remainingChuteBoxes(state),
    conveyorCount: state.conveyor.length + state.fallingMarbles.length,
    remainingBlocks: remainingSortingBlocks(state),
  }), [state])

  const handleBoxClick = useCallback((boxId: string): void => {
    setState((current) => openBox(current, boxId))
  }, [])

  const handleMagnet = useCallback((): void => {
    setState((current) => applyMagnetPowerUp(current))
  }, [])

  const handleShuffle = useCallback((): void => {
    setState((current) => applyShufflePowerUp(current))
  }, [])

  const handleExtraBelt = useCallback((): void => {
    setState((current) => applyExtraBeltPowerUp(current))
  }, [])

  const handleColorblindModeChange = useCallback((enabled: boolean): void => {
    setColorblindMode(enabled)
    saveColorblindMode(enabled)
  }, [])

  const handleNextLevel = useCallback((): void => {
    clearLevelSnapshot()
    setState((current) => advanceToNextLevel(current))
  }, [])

  const handleReset = useCallback((): void => {
    clearLevelSnapshot()
    setState((current) => restartLevel(current))
  }, [])

  return (
    <div className="bg-emerald-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <PortraitGameShell contentClassName="gap-2 px-2 py-2 sm:gap-2.5 sm:px-4 sm:py-3 lg:px-5">
        <GameControls
          colorblindMode={colorblindMode}
          stats={stats}
          statsExpanded={statsExpanded}
          state={state}
          onColorblindModeChange={handleColorblindModeChange}
          onExtraBelt={handleExtraBelt}
          onMagnet={handleMagnet}
          onReset={handleReset}
          onShuffle={handleShuffle}
          onStatsExpandedChange={setStatsExpanded}
          onTutorialOpen={() => setTutorialOpen(true)}
        />

        <section className="relative min-h-0 flex-1">
          <MarbleSortScene
            colorblindMode={colorblindMode}
            state={state}
            onBoxClick={handleBoxClick}
          />

          <div
            className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[calc(100%-2rem)] sm:text-sm dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-100"
            key={state.lastMessage}
          >
            <span
              className={cn(
                'size-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-950/20',
                availableConveyorSlots(state) < 9 && 'bg-amber-400',
                state.completedLevel && 'bg-sky-400',
                state.gameOver && 'bg-rose-500',
              )}
              aria-hidden="true"
            />
            <span>{state.lastMessage}</span>
          </div>

          <LevelCompleteOverlay state={state} onNextLevel={handleNextLevel} onRestart={handleReset} />
        </section>
      </PortraitGameShell>

      <TutorialOverlay open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </div>
  )
}

function loadColorblindMode(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(COLORBLIND_MODE_STORAGE_KEY) === '1'
}

function saveColorblindMode(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(COLORBLIND_MODE_STORAGE_KEY, enabled ? '1' : '0')
}
