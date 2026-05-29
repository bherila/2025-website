import { Accessibility, ChevronDown, Coins, HelpCircle, Magnet, MoveRight, Package, RotateCcw, Shuffle } from 'lucide-react'
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

import { type GameState, labelForPowerUp } from './gameEngine'

export interface GameStats {
  boxCount: number
  chuteBoxes: number
  conveyorCount: number
  remainingBlocks: number
}

interface PowerUpConfirmation {
  actionLabel: string
  description: string
  title: string
}

interface GameControlsProps {
  colorblindMode: boolean
  stats: GameStats
  statsExpanded: boolean
  state: GameState
  onColorblindModeChange: (enabled: boolean) => void
  onExtraBelt: () => void
  onMagnet: () => void
  onReset: () => void
  onShuffle: () => void
  onStatsExpandedChange: Dispatch<SetStateAction<boolean>>
  onTutorialOpen: () => void
}

const POWER_UP_CONFIRMATIONS = {
  extraBelt: {
    actionLabel: 'Use Extra Belt',
    description: 'Extra Belt adds room for one more opened box worth of marbles on the conveyor for this level.',
    title: 'Use Extra Belt?',
  },
  magnet: {
    actionLabel: 'Use Magnet',
    description: 'Magnet immediately pulls conveyor marbles into matching open sorting blocks while slots are available.',
    title: 'Use Magnet?',
  },
  shuffle: {
    actionLabel: 'Use Shuffle',
    description: 'Shuffle changes the remaining box colors into another solvable arrangement without changing counts.',
    title: 'Use Shuffle?',
  },
} satisfies Record<string, PowerUpConfirmation>

export function GameControls({
  colorblindMode,
  stats,
  statsExpanded,
  state,
  onColorblindModeChange,
  onExtraBelt,
  onMagnet,
  onReset,
  onShuffle,
  onStatsExpandedChange,
  onTutorialOpen,
}: GameControlsProps): ReactElement {
  return (
    <>
      <MobileStatsHeader
        colorblindMode={colorblindMode}
        stats={stats}
        statsExpanded={statsExpanded}
        state={state}
        onColorblindModeChange={onColorblindModeChange}
        onStatsExpandedChange={onStatsExpandedChange}
      />
      <DesktopStatsHeader
        colorblindMode={colorblindMode}
        stats={stats}
        state={state}
        onColorblindModeChange={onColorblindModeChange}
      />
      <BottomControls
        stats={stats}
        state={state}
        onExtraBelt={onExtraBelt}
        onMagnet={onMagnet}
        onReset={onReset}
        onShuffle={onShuffle}
        onTutorialOpen={onTutorialOpen}
      />
    </>
  )
}

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

function MobileStatsHeader({
  colorblindMode,
  stats,
  statsExpanded,
  state,
  onColorblindModeChange,
  onStatsExpandedChange,
}: MobileStatsHeaderProps): ReactElement {
  return (
    <header className="sm:hidden">
      <button
        className="flex h-14 w-full items-center justify-between rounded-2xl border border-white/70 bg-white/85 px-2.5 text-left shadow-lg shadow-slate-950/10 backdrop-blur-md dark:border-white/10 dark:bg-slate-900/80"
        type="button"
        onClick={() => onStatsExpandedChange((current) => !current)}
      >
        <span className="flex items-center gap-2">
          <LevelPill level={state.level} />
          <Chip icon={<Coins className="size-4 text-amber-500" />} value={state.levelScore.toLocaleString()} />
          <Chip icon={<Package className="size-4 text-sky-500" />} value={String(stats.boxCount)} />
        </span>
        <ChevronDown className={cn('mr-1 size-5 shrink-0 text-slate-400 transition-transform', statsExpanded && 'rotate-180')} />
      </button>
      <div className={cn('mt-2 grid grid-cols-3 gap-1.5 rounded-2xl border border-white/60 bg-white/75 p-1.5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-slate-900/70', !statsExpanded && 'hidden')}>
        <Metric label="Total" value={state.totalScore.toLocaleString()} />
        <Metric label="Best" value={state.highScore.toLocaleString()} />
        <Metric label="Belt" value={`${stats.conveyorCount}/${state.conveyorCapacity}`} />
        <Metric label="Chutes" value={String(stats.chuteBoxes)} />
        <Metric label="Blocks" value={String(stats.remainingBlocks)} />
        <ColorblindToggle
          checked={colorblindMode}
          className="col-span-3"
          id="marble-sort-colorblind-mobile"
          onCheckedChange={onColorblindModeChange}
        />
      </div>
    </header>
  )
}

function DesktopStatsHeader({ colorblindMode, stats, state, onColorblindModeChange }: StatsHeaderProps): ReactElement {
  return (
    <header className="hidden items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-lg shadow-slate-950/10 backdrop-blur-md sm:flex dark:border-white/10 dark:bg-slate-900/75">
      <div className="flex min-w-0 items-center gap-3">
        <LevelPill level={state.level} />
        <div className="flex flex-wrap items-center gap-1.5">
          <Metric label="Level Score" value={state.levelScore.toLocaleString()} />
          <Metric label="Total" value={state.totalScore.toLocaleString()} />
          <Metric label="Best" value={state.highScore.toLocaleString()} />
          <Metric label="Boxes" value={String(stats.boxCount)} />
          <Metric label="Chutes" value={String(stats.chuteBoxes)} />
          <Metric label="Belt" value={`${stats.conveyorCount}/${state.conveyorCapacity}`} />
          <Metric label="Blocks" value={String(stats.remainingBlocks)} />
        </div>
      </div>
      <ColorblindToggle
        checked={colorblindMode}
        id="marble-sort-colorblind-desktop"
        onCheckedChange={onColorblindModeChange}
      />
    </header>
  )
}

interface BottomControlsProps {
  stats: GameStats
  state: GameState
  onExtraBelt: () => void
  onMagnet: () => void
  onReset: () => void
  onShuffle: () => void
  onTutorialOpen: () => void
}

function BottomControls({
  stats,
  state,
  onExtraBelt,
  onMagnet,
  onReset,
  onShuffle,
  onTutorialOpen,
}: BottomControlsProps): ReactElement {
  const actionDisabled = Boolean(state.completedLevel || state.gameOver)

  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 flex justify-center sm:bottom-3">
      <div className="pointer-events-auto flex items-center gap-2 rounded-3xl border border-white/70 bg-white/85 p-2 shadow-xl shadow-slate-950/20 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80">
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-rose-400 to-rose-600 text-white hover:from-rose-400 hover:to-rose-600"
          confirmation={POWER_UP_CONFIRMATIONS.magnet}
          count={state.powerUps.magnet}
          disabled={state.powerUps.magnet < 1 || stats.conveyorCount < 1 || actionDisabled}
          icon={<Magnet />}
          label={labelForPowerUp('magnet')}
          onClick={onMagnet}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-violet-400 to-violet-600 text-white hover:from-violet-400 hover:to-violet-600"
          confirmation={POWER_UP_CONFIRMATIONS.shuffle}
          count={state.powerUps.shuffle}
          disabled={state.powerUps.shuffle < 1 || stats.boxCount < 2 || actionDisabled}
          icon={<Shuffle />}
          label={labelForPowerUp('shuffle')}
          onClick={onShuffle}
        />
        <BottomControlButton
          accentClassName="bg-gradient-to-b from-sky-400 to-sky-600 text-white hover:from-sky-400 hover:to-sky-600"
          confirmation={POWER_UP_CONFIRMATIONS.extraBelt}
          count={state.powerUps.extraBelt}
          disabled={state.powerUps.extraBelt < 1 || actionDisabled}
          icon={<MoveRight />}
          label={labelForPowerUp('extraBelt')}
          onClick={onExtraBelt}
        />
        <span className="mx-0.5 h-9 w-px shrink-0 bg-slate-300/70 dark:bg-white/10" />
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

function LevelPill({ level }: { level: number }): ReactElement {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-gradient-to-b from-violet-500 to-indigo-600 px-3 py-1.5 text-white shadow-md shadow-indigo-950/25">
      <span className="text-[10px] font-bold uppercase leading-none text-white/70">Level</span>
      <span className="text-2xl font-black leading-none tabular-nums">{level}</span>
    </div>
  )
}

interface ChipProps {
  icon: ReactNode
  value: string
}

function Chip({ icon, value }: ChipProps): ReactElement {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/10">
      {icon}
      <span className="text-sm font-black leading-none tabular-nums text-slate-900 dark:text-slate-50">{value}</span>
    </span>
  )
}

interface MetricProps {
  label: string
  value: string
}

function Metric({ label, value }: MetricProps): ReactElement {
  return (
    <div className="min-w-16 rounded-md border border-slate-200/70 bg-white/55 px-2 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/5">
      <div className="text-[10px] font-bold uppercase leading-none text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 font-black leading-none tabular-nums text-slate-950 dark:text-slate-50">{value}</div>
    </div>
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
    <div className={cn('flex items-center justify-between gap-3 rounded-md border border-slate-200/80 bg-white/60 px-2.5 py-1.5 shadow-xs dark:border-white/10 dark:bg-white/5', className)}>
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

interface BottomControlButtonProps {
  disabled: boolean
  icon: ReactNode
  label: string
  onClick: () => void
  accentClassName?: string
  confirmation?: PowerUpConfirmation
  count?: number
  variant?: ComponentProps<typeof Button>['variant']
}

function BottomControlButton({
  accentClassName,
  confirmation,
  count,
  disabled,
  icon,
  label,
  onClick,
  variant = 'default',
}: BottomControlButtonProps): ReactElement {
  const button = (
    <Button
      aria-label={label}
      className={cn(
        'relative size-14 rounded-2xl p-0 shadow-md transition-transform active:scale-95 disabled:opacity-40',
        accentClassName,
      )}
      disabled={disabled}
      size="icon"
      type="button"
      variant={variant}
      onClick={confirmation ? undefined : onClick}
    >
      <span className="[&>svg]:size-6">{icon}</span>
      {count !== undefined && (
        <span className="absolute -right-1.5 -top-1.5 min-w-6 rounded-full border-2 border-white bg-rose-600 px-1 text-xs font-black leading-5 text-white shadow-sm dark:border-slate-950">
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

  if (confirmation) {
    return (
      <AlertDialog>
        <Tooltip>
          <TooltipTrigger asChild>
            {trigger}
          </TooltipTrigger>
          <TooltipContent side="top">{label}</TooltipContent>
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
