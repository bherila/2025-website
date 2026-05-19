import { ArrowRight, Trophy } from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'

import { CarsScene } from './CarsScene'
import { GameControls, type GameStats } from './GameControls'
import {
  advanceToNextLevel,
  applyFillPowerUp,
  applyShufflePowerUp,
  applyVipPowerUp,
  canMoveCar,
  type GameState,
  labelForPowerUp,
  loadProgress,
  moveCarToParking,
  openParkingSlot,
  processBoardingAtParkingGate,
  progressFromState,
  restartLevel,
  saveProgress,
  startGameFromProgress,
} from './gameEngine'

export function CarsGame(): ReactElement {
  const [state, setState] = useState<GameState>(() => startGameFromProgress(loadProgress()))
  const [vipSelectionActive, setVipSelectionActive] = useState(false)
  const [blockedCarAttempt, setBlockedCarAttempt] = useState<{ carId: string, nonce: number } | null>(null)
  const [statsExpanded, setStatsExpanded] = useState(false)

  useEffect(() => {
    saveProgress(progressFromState(state))
  }, [state])

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

  const handlePassengerGate = useCallback((passengerId: string): void => {
    setState((current) => processBoardingAtParkingGate(current, passengerId))
  }, [])

  const handleNextLevel = useCallback((): void => {
    setVipSelectionActive(false)
    setState((current) => advanceToNextLevel(current))
  }, [])

  const handleReset = useCallback((): void => {
    setVipSelectionActive(false)
    setState((current) => restartLevel(current))
  }, [])

  return (
    <main className="h-screen overflow-hidden bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto flex h-full max-w-7xl flex-col gap-2 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3 lg:px-6">
        <GameControls
          stats={stats}
          statsExpanded={statsExpanded}
          state={state}
          vipSelectionActive={vipSelectionActive}
          onFill={handleFill}
          onOpenSlot={handleOpenSlot}
          onReset={handleReset}
          onShuffle={handleShuffle}
          onStatsExpandedChange={setStatsExpanded}
          onVipSelectionActiveChange={setVipSelectionActive}
        />

        <section className="relative min-h-0 flex-1">
          <CarsScene
            blockedCarAttempt={blockedCarAttempt}
            state={state}
            vipSelectionActive={vipSelectionActive}
            onCarClick={handleCarClick}
            onPassengerGate={handlePassengerGate}
          />

          <div className="pointer-events-none absolute left-2 top-2 z-10 max-w-[calc(100%-1rem)] rounded-lg border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-lg shadow-slate-950/10 sm:left-3 sm:top-3 sm:max-w-[calc(100%-1.5rem)] sm:text-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100">
            {vipSelectionActive ? 'VIP selection active' : state.lastMessage}
          </div>

          {state.completedLevel && (
            <div className="absolute inset-x-4 top-20 mx-auto max-w-md rounded-lg border border-emerald-200 bg-white/95 p-5 text-center shadow-2xl shadow-slate-950/20 dark:border-emerald-900 dark:bg-slate-950/95">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <Trophy className="size-6" />
              </div>
              <div className="text-xl font-bold">Level {state.completedLevel.level} Complete</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {state.completedLevel.score.toLocaleString()} points · Earned {labelForPowerUp(state.completedLevel.awardedPowerUp)}
              </div>
              <Button className="mt-4 h-11 w-full" type="button" onClick={handleNextLevel}>
                Next Level
                <ArrowRight className="size-4" />
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
