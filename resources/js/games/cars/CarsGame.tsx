import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

import { PortraitGameShell } from '../PortraitGameShell'
import { CarsScene } from './CarsScene'
import {
  BottomControls,
  DesktopStatsHeader,
  type GameStats,
  MobileStatsOverlay,
} from './GameControls'
import {
  advanceToNextLevel,
  applyFillPowerUp,
  applyShufflePowerUp,
  applyVipPowerUp,
  canMoveCar,
  clearLevelSnapshot,
  type GameState,
  generateLevel,
  loadLevelSnapshot,
  loadProgress,
  moveCarToParking,
  openParkingSlot,
  processBoardingAtParkingGate,
  progressFromState,
  restartLevel,
  saveLevelSnapshot,
  saveProgress,
  startGameFromProgress,
} from './gameEngine'
import { LevelCompleteOverlay } from './LevelCompleteOverlay'
import { shouldShowCarsTutorial, TutorialOverlay } from './TutorialOverlay'
import { readParkingPickupVisualTestOptions } from './visualTestMode'

const COLORBLIND_MODE_STORAGE_KEY = 'bwh.cars-game.colorblind.v1'

export function CarsGame(): ReactElement {
  const visualTestOptions = useMemo(() => readParkingPickupVisualTestOptions(), [])
  const [state, setState] = useState<GameState>(() => {
    if (visualTestOptions.enabled) {
      return generateLevel(visualTestOptions.level ?? 1)
    }

    const progress = loadProgress()

    return loadLevelSnapshot(undefined, progress) ?? startGameFromProgress(progress)
  })
  const [vipSelectionActive, setVipSelectionActive] = useState(false)
  const [blockedCarAttempt, setBlockedCarAttempt] = useState<{ carId: string, nonce: number } | null>(null)
  const [statsExpanded, setStatsExpanded] = useState(() => {
    if (visualTestOptions.enabled) {
      return visualTestOptions.hud === 'normal'
    }

    return false
  })
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    if (visualTestOptions.enabled) {
      return false
    }

    return shouldShowCarsTutorial()
  })
  const [colorblindMode, setColorblindMode] = useState(() => {
    if (visualTestOptions.enabled && visualTestOptions.colorblind !== null) {
      return visualTestOptions.colorblind
    }

    return loadColorblindMode()
  })

  useEffect(() => {
    if (visualTestOptions.enabled) {
      return
    }

    saveProgress(progressFromState(state))
    if (state.completedLevel) {
      clearLevelSnapshot()
      return
    }

    saveLevelSnapshot(state)
  }, [state, visualTestOptions.enabled])

  const stats = useMemo<GameStats>(() => {
    const departedCars = state.cars.filter((car) => car.status === 'departed').length
    const unlockedRegularSlots = state.parkingSlots.filter((slot) => slot.kind === 'regular' && slot.unlocked).length
    const parkedCars = state.cars.filter((car) => car.status === 'parked').length
    const hasLockedRegularSlot = state.parkingSlots.some((slot) => slot.kind === 'regular' && !slot.unlocked)

    return {
      departedCars,
      totalCars: state.cars.length,
      unlockedRegularSlots,
      parkedCars,
      hasLockedRegularSlot,
    }
  }, [state])

  const handleCarClick = useCallback((carId: string): void => {
    setState((current) => {
      if (current.failedLevel) {
        return current
      }

      if (vipSelectionActive) {
        return applyVipPowerUp(current, carId)
      }

      const clickedCar = current.cars.find((car) => car.id === carId)
      if (clickedCar?.status === 'field' && !canMoveCar(current, carId)) {
        setBlockedCarAttempt({ carId, nonce: Date.now() })
      }

      return moveCarToParking(current, carId)
    })
    setVipSelectionActive(false)
  }, [vipSelectionActive])

  const handleShuffle = useCallback((): void => {
    setVipSelectionActive(false)
    setState((current) => applyShufflePowerUp(current))
  }, [])

  const handleFill = useCallback((): void => {
    setVipSelectionActive(false)
    setState((current) => applyFillPowerUp(current))
  }, [])

  const handleOpenSlot = useCallback((): void => {
    setState((current) => openParkingSlot(current))
  }, [])

  const handleColorblindModeChange = useCallback((enabled: boolean): void => {
    setColorblindMode(enabled)
    if (!visualTestOptions.enabled) {
      saveColorblindMode(enabled)
    }
  }, [visualTestOptions.enabled])

  const handlePassengerGate = useCallback((passengerId: string): void => {
    setState((current) => processBoardingAtParkingGate(current, passengerId))
  }, [])

  const handleNextLevel = useCallback((): void => {
    setVipSelectionActive(false)
    if (!visualTestOptions.enabled) {
      clearLevelSnapshot()
    }
    setState((current) => advanceToNextLevel(current))
  }, [visualTestOptions.enabled])

  const handleReset = useCallback((): void => {
    setVipSelectionActive(false)
    if (!visualTestOptions.enabled) {
      clearLevelSnapshot()
    }
    setState((current) => restartLevel(current))
  }, [visualTestOptions.enabled])

  return (
    <div className="bg-sky-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <PortraitGameShell contentClassName="gap-1 px-0 py-0 sm:gap-2.5 sm:px-4 sm:py-3 lg:px-5">
        <DesktopStatsHeader
          colorblindMode={colorblindMode}
          stats={stats}
          state={state}
          onColorblindModeChange={handleColorblindModeChange}
        />

        <section className="relative min-h-0 flex-1">
          <CarsScene
            blockedCarAttempt={blockedCarAttempt}
            colorblindMode={colorblindMode}
            state={state}
            vipSelectionActive={vipSelectionActive}
            visualTestOptions={visualTestOptions}
            onCarClick={handleCarClick}
            onPassengerGate={handlePassengerGate}
          />

          <MobileStatsOverlay
            colorblindMode={colorblindMode}
            stats={stats}
            statsExpanded={statsExpanded}
            state={state}
            onColorblindModeChange={handleColorblindModeChange}
            onStatsExpandedChange={setStatsExpanded}
          />

          <BottomControls
            stats={stats}
            state={state}
            vipSelectionActive={vipSelectionActive}
            onFill={handleFill}
            onOpenSlot={handleOpenSlot}
            onReset={handleReset}
            onShuffle={handleShuffle}
            onTutorialOpen={() => setTutorialOpen(true)}
            onVipSelectionActiveChange={setVipSelectionActive}
          />

          <style>{`
            @keyframes cars-blocked-toast-pulse {
              0% {
                box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.55);
                transform: scale(1);
              }

              45% {
                box-shadow: 0 0 0 0.45rem rgba(239, 68, 68, 0.18);
                transform: scale(1.015);
              }

              100% {
                box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
                transform: scale(1);
              }
            }

            .cars-blocked-toast-pulse {
              animation: cars-blocked-toast-pulse 420ms ease-out both;
            }

            @media (prefers-reduced-motion: reduce) {
              .cars-blocked-toast-pulse {
                animation: none;
              }
            }
          `}</style>
          <div
            className={cn(
              'pointer-events-none absolute left-3 top-[4.75rem] z-10 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-800 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:left-4 sm:top-4 sm:max-w-[calc(100%-2rem)] sm:text-sm dark:border-white/10 dark:bg-slate-950/75 dark:text-slate-100',
              statsExpanded && 'top-[10.25rem] sm:top-4',
              blockedCarAttempt && 'cars-blocked-toast-pulse border-rose-300 bg-rose-50/90 text-rose-950 dark:border-rose-500/50 dark:bg-rose-950/75 dark:text-rose-100',
            )}
            key={blockedCarAttempt?.nonce ?? 'cars-message'}
          >
            <span
              className={cn(
                'size-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-950/20',
                vipSelectionActive && 'bg-amber-400',
                blockedCarAttempt && 'bg-rose-500',
              )}
              aria-hidden="true"
            />
            <span>{vipSelectionActive ? 'VIP selection active' : state.lastMessage}</span>
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
