import { Accessibility, ChevronDown, Crown, HelpCircle, Plus, RotateCcw, Shuffle, Users } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import { type GameState, getLevelDifficulty } from './gameEngine'

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

interface StatsHeaderProps {
  colorblindMode: boolean
  stats: GameStats
  state: GameState
  onColorblindModeChange: (enabled: boolean) => void
}

interface MobileStatsHeaderProps extends StatsHeaderProps {
  statsExpanded: boolean
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
}

export function MobileStatsOverlay({
  colorblindMode,
  stats,
  statsExpanded,
  state,
  onColorblindModeChange,
  onStatsExpandedChange,
}: MobileStatsHeaderProps): ReactElement {
  return (
    <header className="pointer-events-none absolute inset-x-2 top-2 z-30 sm:hidden">
      <button
        className="pointer-events-auto flex min-h-12 w-full items-center justify-between rounded-xl border border-white/70 bg-white/85 px-3 py-1.5 text-left shadow-sm shadow-slate-950/5 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80 dark:shadow-slate-950/25"
        type="button"
        onClick={() => onStatsExpandedChange((current) => !current)}
      >
        <span className="flex items-center gap-3">
          <span className="flex min-w-10 flex-col items-start">
            <span className="block text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Level</span>
            <span className="block text-xl font-bold leading-none">{state.level}</span>
            <DifficultyBadge level={state.level} compact />
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
      <div className={cn('pointer-events-auto mt-2 grid grid-cols-3 gap-1.5 rounded-xl border border-white/60 bg-white/70 p-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70', !statsExpanded && 'hidden')}>
        <Metric label="Total Score" value={state.totalScore.toLocaleString()} />
        <Metric label="Best" value={state.highScore.toLocaleString()} />
        <Metric label="Queue" value={state.passengerQueue.length.toLocaleString()} />
        <Metric label="Spaces" value={String(stats.unlockedRegularSlots)} />
        <ColorblindToggle
          checked={colorblindMode}
          className="col-span-3"
          id="cars-colorblind-mobile"
          onCheckedChange={onColorblindModeChange}
        />
      </div>
    </header>
  )
}

export function DesktopStatsHeader({ colorblindMode, stats, state, onColorblindModeChange }: StatsHeaderProps): ReactElement {
  return (
    <header className="hidden items-center justify-between gap-4 rounded-xl border border-white/70 bg-white/75 px-3 py-2 shadow-sm shadow-slate-950/5 backdrop-blur-md sm:flex dark:border-white/10 dark:bg-slate-900/75 dark:shadow-slate-950/25">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-24 flex-col items-center rounded-2xl bg-gradient-to-b from-violet-500 to-indigo-600 px-3 py-2 text-white shadow-md shadow-indigo-950/25">
          <span className="text-[10px] font-bold uppercase leading-none text-white/70">Level</span>
          <span className="text-2xl font-black leading-none tabular-nums">{state.level}</span>
          <DifficultyBadge level={state.level} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Metric label="Level Score" value={state.levelScore.toLocaleString()} />
          <Metric label="Total" value={state.totalScore.toLocaleString()} />
          <Metric label="Best" value={state.highScore.toLocaleString()} />
          <Metric label="Cars" value={`${stats.departedCars}/${stats.totalCars}`} />
          <Metric label="Queue" value={state.passengerQueue.length.toLocaleString()} />
          <Metric label="Spaces" value={String(stats.unlockedRegularSlots)} />
        </div>
      </div>
      <ColorblindToggle
        checked={colorblindMode}
        id="cars-colorblind-desktop"
        onCheckedChange={onColorblindModeChange}
      />
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
  onTutorialOpen: () => void
  onVipSelectionActiveChange: Dispatch<SetStateAction<boolean>>
}

export function BottomControls({
  stats,
  state,
  vipSelectionActive,
  onFill,
  onOpenSlot,
  onReset,
  onShuffle,
  onTutorialOpen,
  onVipSelectionActiveChange,
}: BottomControlsProps): ReactElement {
  const levelEnded = Boolean(state.completedLevel || state.failedLevel)

  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center sm:bottom-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-3xl border border-white/70 bg-white/85 p-2 shadow-xl shadow-slate-950/20 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80">
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-amber-300 to-amber-500 text-amber-950 hover:from-amber-300 hover:to-amber-500"
          active={vipSelectionActive}
          confirmation={vipSelectionActive ? undefined : POWER_UP_CONFIRMATIONS.vip}
          count={state.powerUps.vip}
          disabled={state.powerUps.vip < 1 || levelEnded}
          icon={<Crown />}
          label="VIP"
          onClick={() => onVipSelectionActiveChange((current) => !current)}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-violet-400 to-violet-600 text-white hover:from-violet-400 hover:to-violet-600"
          confirmation={POWER_UP_CONFIRMATIONS.shuffle}
          count={state.powerUps.shuffle}
          disabled={state.powerUps.shuffle < 1 || levelEnded}
          icon={<Shuffle />}
          label="Shuffle"
          onClick={onShuffle}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-sky-400 to-sky-600 text-white hover:from-sky-400 hover:to-sky-600"
          confirmation={POWER_UP_CONFIRMATIONS.fill}
          count={state.powerUps.fill}
          disabled={state.powerUps.fill < 1 || stats.parkedCars < 1 || levelEnded}
          icon={<Users />}
          label="Fill"
          onClick={onFill}
        />
        <span className="mx-0.5 h-9 w-px shrink-0 bg-slate-300/70 dark:bg-white/10" />
        <BottomControlButton
          disabled={!stats.hasLockedRegularSlot || levelEnded}
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
        <BottomControlButton
          disabled={false}
          icon={<HelpCircle />}
          label="Tutorial"
          variant="ghost"
          onClick={onTutorialOpen}
        />
      </div>
    </div>
  )
}

function DifficultyBadge({ compact = false, level }: { compact?: boolean, level: number }): ReactElement | null {
  const difficulty = getLevelDifficulty(level)
  if (difficulty.kind === 'regular') {
    return null
  }

  return (
    <span
      className={cn(
        'mt-1 rounded bg-red-600 px-1.5 py-0.5 font-black uppercase leading-none tracking-normal text-white shadow-sm shadow-red-950/25 dark:bg-red-500 dark:text-white',
        compact ? 'text-[8px]' : 'text-[9px]',
        difficulty.kind === 'super-hard' && 'bg-red-700 dark:bg-red-600',
      )}
    >
      {difficulty.label}
    </span>
  )
}

interface ColorblindToggleProps {
  checked: boolean
  id: string
  onCheckedChange: (enabled: boolean) => void
  className?: string
}

function ColorblindToggle({ checked, className, id, onCheckedChange }: ColorblindToggleProps): ReactElement {
  return (
    <div className={cn('flex items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white/60 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/5', className)}>
      <Label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200" htmlFor={id}>
        <Accessibility className="size-4 text-slate-500 dark:text-slate-400" />
        Colorblind mode
      </Label>
      <Switch
        aria-label="Colorblind mode"
        checked={checked}
        id={id}
        onCheckedChange={onCheckedChange}
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
    <div className="min-w-20 rounded-lg border border-slate-200/70 bg-white/55 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/5">
      <div className="text-[10px] font-bold uppercase leading-none text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cn('mt-1 font-black leading-none tabular-nums text-slate-950 dark:text-slate-50', emphasis ? 'text-2xl' : 'text-base')}>{value}</div>
    </div>
  )
}

interface BottomControlButtonProps {
  accentClassName?: string
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
  accentClassName,
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
      aria-pressed={active ? true : undefined}
      className={cn(
        'relative size-12 min-w-0 rounded-2xl border-slate-200 bg-white/90 p-0 text-slate-800 shadow-md shadow-slate-950/10 transition-transform hover:-translate-y-0.5 hover:bg-white active:scale-95 disabled:opacity-40 sm:size-14 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 [&_svg]:size-6',
        accentClassName,
        active && 'border-amber-300 bg-amber-300 text-amber-950 shadow-amber-950/15 ring-2 ring-amber-200 dark:border-amber-300 dark:bg-amber-300 dark:text-amber-950 dark:ring-amber-200/50',
      )}
      disabled={disabled}
      type="button"
      variant={variant}
      onClick={confirmation ? undefined : onClick}
    >
      {icon}
      {count >= 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex min-w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 px-1 text-xs font-black leading-5 text-white shadow-sm dark:border-slate-950">
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
