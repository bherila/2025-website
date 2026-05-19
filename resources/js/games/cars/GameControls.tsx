import { ChevronDown, Crown, Plus, RotateCcw, Shuffle, Users } from 'lucide-react'
import { type ComponentProps, type Dispatch, type ReactElement, type ReactNode, type SetStateAction } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { type GameState } from './gameEngine'

export interface GameStats {
  departedCars: number
  hasLockedRegularSlot: boolean
  parkedCars: number
  totalCars: number
  unlockedRegularSlots: number
}

interface PowerUpConfirmation {
  actionLabel: string
  description: string
  title: string
}

interface GameControlsProps {
  stats: GameStats
  statsExpanded: boolean
  state: GameState
  vipSelectionActive: boolean
  onFill: () => void
  onOpenSlot: () => void
  onReset: () => void
  onShuffle: () => void
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
  onVipSelectionActiveChange: Dispatch<SetStateAction<boolean>>
}

const POWER_UP_CONFIRMATIONS = {
  vip: {
    actionLabel: 'Use VIP',
    description: 'VIP lets you select one visible car and send it to the VIP space, bypassing normal blocking. It is spent when you choose the car.',
    title: 'Use VIP power-up?',
  },
  shuffle: {
    actionLabel: 'Use Shuffle',
    description: 'Shuffle swaps the active car colors into another solvable setup without moving any cars.',
    title: 'Use Shuffle power-up?',
  },
  fill: {
    actionLabel: 'Use Fill',
    description: 'Fill pulls passengers from the queue in FIFO order to fill currently parked cars as much as possible.',
    title: 'Use Fill power-up?',
  },
} satisfies Record<string, PowerUpConfirmation>

export function GameControls({
  stats,
  statsExpanded,
  state,
  vipSelectionActive,
  onFill,
  onOpenSlot,
  onReset,
  onShuffle,
  onStatsExpandedChange,
  onVipSelectionActiveChange,
}: GameControlsProps): ReactElement {
  return (
    <>
      <MobileStatsHeader
        stats={stats}
        statsExpanded={statsExpanded}
        state={state}
        onStatsExpandedChange={onStatsExpandedChange}
      />

      <DesktopStatsHeader stats={stats} state={state} />

      <BottomControls
        stats={stats}
        state={state}
        vipSelectionActive={vipSelectionActive}
        onFill={onFill}
        onOpenSlot={onOpenSlot}
        onReset={onReset}
        onShuffle={onShuffle}
        onVipSelectionActiveChange={onVipSelectionActiveChange}
      />
    </>
  )
}

interface StatsHeaderProps {
  stats: GameStats
  state: GameState
}

interface MobileStatsHeaderProps extends StatsHeaderProps {
  statsExpanded: boolean
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
}

function MobileStatsHeader({ stats, statsExpanded, state, onStatsExpandedChange }: MobileStatsHeaderProps): ReactElement {
  return (
    <header className="sm:hidden">
      <button
        className="flex h-12 w-full items-center justify-between rounded-lg border border-white/70 bg-white/90 px-3 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900"
        type="button"
        onClick={() => onStatsExpandedChange((current) => !current)}
      >
        <span className="flex items-center gap-3">
          <span>
            <span className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Level</span>
            <span className="block text-xl font-bold leading-none">{state.level}</span>
          </span>
          <span>
            <span className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Score</span>
            <span className="block text-xl font-bold leading-none tabular-nums">{state.levelScore.toLocaleString()}</span>
          </span>
          <span>
            <span className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Cars</span>
            <span className="block text-xl font-bold leading-none tabular-nums">{stats.departedCars}/{stats.totalCars}</span>
          </span>
        </span>
        <ChevronDown className={cn('size-5 text-slate-500 transition-transform', statsExpanded && 'rotate-180')} />
      </button>
      <div className={cn('mt-2 grid grid-cols-3 gap-2', !statsExpanded && 'hidden')}>
        <Metric label="Total Score" value={state.totalScore.toLocaleString()} />
        <Metric label="Best" value={state.highScore.toLocaleString()} />
        <Metric label="Queue" value={state.passengerQueue.length.toLocaleString()} />
        <Metric label="Spaces" value={String(stats.unlockedRegularSlots)} />
      </div>
    </header>
  )
}

function DesktopStatsHeader({ stats, state }: StatsHeaderProps): ReactElement {
  return (
    <header className="hidden gap-2 sm:grid lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <Metric emphasis label="Level" value={String(state.level)} />
        <Metric label="Level Score" value={state.levelScore.toLocaleString()} />
        <Metric label="Total Score" value={state.totalScore.toLocaleString()} />
        <Metric label="Best" value={state.highScore.toLocaleString()} />
        <Metric label="Cars" value={`${stats.departedCars}/${stats.totalCars}`} />
        <Metric label="Queue" value={state.passengerQueue.length.toLocaleString()} />
        <Metric label="Spaces" value={String(stats.unlockedRegularSlots)} />
      </div>
    </header>
  )
}

interface BottomControlsProps {
  stats: GameStats
  state: GameState
  vipSelectionActive: boolean
  onFill: () => void
  onOpenSlot: () => void
  onReset: () => void
  onShuffle: () => void
  onVipSelectionActiveChange: Dispatch<SetStateAction<boolean>>
}

function BottomControls({
  stats,
  state,
  vipSelectionActive,
  onFill,
  onOpenSlot,
  onReset,
  onShuffle,
  onVipSelectionActiveChange,
}: BottomControlsProps): ReactElement {
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 grid grid-cols-5 gap-2 sm:inset-x-auto sm:left-1/2 sm:w-auto sm:-translate-x-1/2 sm:grid-cols-[repeat(5,3.5rem)]">
      <BottomControlButton
        active={vipSelectionActive}
        confirmation={vipSelectionActive ? undefined : POWER_UP_CONFIRMATIONS.vip}
        count={state.powerUps.vip}
        disabled={state.powerUps.vip < 1 || Boolean(state.completedLevel)}
        icon={<Crown />}
        label="VIP"
        onClick={() => onVipSelectionActiveChange((current) => !current)}
      />
      <BottomControlButton
        confirmation={POWER_UP_CONFIRMATIONS.shuffle}
        count={state.powerUps.shuffle}
        disabled={state.powerUps.shuffle < 1 || Boolean(state.completedLevel)}
        icon={<Shuffle />}
        label="Shuffle"
        onClick={onShuffle}
      />
      <BottomControlButton
        confirmation={POWER_UP_CONFIRMATIONS.fill}
        count={state.powerUps.fill}
        disabled={state.powerUps.fill < 1 || stats.parkedCars < 1 || Boolean(state.completedLevel)}
        icon={<Users />}
        label="Fill"
        onClick={onFill}
      />
      <BottomControlButton
        disabled={!stats.hasLockedRegularSlot || Boolean(state.completedLevel)}
        icon={<Plus />}
        label="Open Spot"
        variant="outline"
        onClick={onOpenSlot}
      />
      <BottomControlButton
        disabled={false}
        icon={<RotateCcw />}
        label="Reset"
        variant="ghost"
        onClick={onReset}
      />
    </div>
  )
}

interface MetricProps {
  emphasis?: boolean
  label: string
  value: string
}

function Metric({ emphasis = false, label, value }: MetricProps): ReactElement {
  return (
    <div className="rounded-lg border border-white/70 bg-white/80 px-2 py-2 shadow-sm sm:px-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-[10px] font-semibold uppercase text-slate-500 sm:text-[11px] dark:text-slate-400">{label}</div>
      <div className={cn('font-bold tabular-nums', emphasis ? 'text-2xl' : 'text-base sm:text-lg')}>{value}</div>
    </div>
  )
}

interface BottomControlButtonProps {
  active?: boolean
  confirmation?: PowerUpConfirmation | undefined
  count?: number
  disabled: boolean
  icon: ReactNode
  label: string
  onClick: () => void
  variant?: ComponentProps<typeof Button>['variant']
}

function BottomControlButton({
  active = false,
  confirmation,
  count = -1,
  disabled,
  icon,
  label,
  onClick,
  variant = 'outline',
}: BottomControlButtonProps): ReactElement {
  const button = (
    <Button
      aria-label={label}
      className={cn(
        'relative h-12 w-full min-w-0 border-slate-300 bg-white/95 px-1 text-xs font-bold text-slate-900 shadow-lg shadow-slate-950/15 hover:bg-white sm:min-w-14 sm:px-3 sm:text-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-50 dark:hover:bg-slate-800',
        active && 'border-amber-400 bg-amber-100 text-amber-950 ring-2 ring-amber-300 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-100',
      )}
      disabled={disabled}
      type="button"
      variant={variant}
      onClick={confirmation ? undefined : onClick}
    >
      {icon}
      {count >= 0 && (
        <span className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-sm">
          {count}
        </span>
      )}
    </Button>
  )
  const trigger = (
    <span className="flex min-w-0" tabIndex={disabled ? 0 : undefined}>
      {confirmation ? (
        <AlertDialogTrigger asChild>
          {button}
        </AlertDialogTrigger>
      ) : button}
    </span>
  )

  if (!confirmation) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {trigger}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          {trigger}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          <p>{label}</p>
        </TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmation.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirmation.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onClick}>{confirmation.actionLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
