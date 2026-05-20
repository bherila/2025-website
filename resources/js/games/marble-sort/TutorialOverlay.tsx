import { ArrowRight, Check, Circle, Gem } from 'lucide-react'
import { type ReactElement, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

import { MARBLE_SORT_PROGRESS_STORAGE_KEY, type SavedGameProgress } from './gameEngine'

export const MARBLE_SORT_TUTORIAL_STORAGE_KEY = 'bwh.marble-sort.tutorial-seen.v1'

export const MARBLE_SORT_TUTORIAL_STEPS = [
  'Bust a box to release nine marbles onto the conveyor.',
  'Marbles sort automatically when they pass a matching 3-slot block.',
  'Chutes refill rows until their counters reach zero. Clear every box, chute, marble, and block.',
] as const

interface TutorialOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function shouldShowMarbleSortTutorial(): boolean {
  if (hasSeenMarbleSortTutorial()) {
    return false
  }

  if (typeof window === 'undefined') {
    return false
  }

  const progressLevel = readProgressLevel(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY))

  return progressLevel === null || progressLevel === 1
}

export function TutorialOverlay({ open, onOpenChange }: TutorialOverlayProps): ReactElement {
  const [currentStep, setCurrentStep] = useState(0)
  const isFinalStep = currentStep === MARBLE_SORT_TUTORIAL_STEPS.length - 1

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      markMarbleSortTutorialSeen()
      setCurrentStep(0)
    }

    onOpenChange(nextOpen)
  }

  const handlePrimaryAction = (): void => {
    if (isFinalStep) {
      markMarbleSortTutorialSeen()
      setCurrentStep(0)
      onOpenChange(false)
      return
    }

    setCurrentStep((step) => step + 1)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="gap-5 overflow-hidden border-slate-200 bg-white p-0 shadow-2xl sm:max-w-md dark:border-slate-800 dark:bg-slate-950"
        showCloseButton={false}
      >
        <DialogHeader className="border-b border-slate-200 bg-slate-50 px-5 py-4 text-left dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <Gem className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-xl text-slate-950 dark:text-slate-50">Marble Sort</DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Learn the loop in three quick steps.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold tabular-nums text-white dark:bg-slate-100 dark:text-slate-950">
              {currentStep + 1}
            </div>
            <p className="min-h-20 text-lg font-semibold leading-7 text-slate-950 dark:text-slate-50">
              {MARBLE_SORT_TUTORIAL_STEPS[currentStep]}
            </p>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2" aria-label="Tutorial progress">
            {MARBLE_SORT_TUTORIAL_STEPS.map((step, index) => (
              <span className="sr-only" key={step}>
                Step {index + 1} of {MARBLE_SORT_TUTORIAL_STEPS.length}
              </span>
            ))}
            {MARBLE_SORT_TUTORIAL_STEPS.map((step, index) => (
              <Circle
                aria-hidden="true"
                className={cn(
                  'size-2.5 fill-current transition-colors motion-reduce:transition-none',
                  index === currentStep ? 'text-emerald-500' : 'text-slate-300 dark:text-slate-700',
                )}
                key={step}
              />
            ))}
          </div>
        </div>

        <DialogFooter className="border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/80">
          <Button className="h-11 w-full sm:w-auto" type="button" onClick={handlePrimaryAction}>
            {primaryActionLabel(currentStep)}
            {isFinalStep ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function hasSeenMarbleSortTutorial(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(MARBLE_SORT_TUTORIAL_STORAGE_KEY) === '1'
}

function markMarbleSortTutorialSeen(): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(MARBLE_SORT_TUTORIAL_STORAGE_KEY, '1')
}

function primaryActionLabel(currentStep: number): string {
  if (currentStep === 0) {
    return 'Got it'
  }

  if (currentStep === MARBLE_SORT_TUTORIAL_STEPS.length - 1) {
    return 'Start playing'
  }

  return 'Next'
}

function readProgressLevel(progressJson: string | null): SavedGameProgress['level'] | null {
  if (!progressJson) {
    return null
  }

  try {
    const progress: unknown = JSON.parse(progressJson)

    if (
      typeof progress === 'object'
      && progress !== null
      && 'level' in progress
      && typeof progress.level === 'number'
    ) {
      return progress.level
    }
  } catch {
    return null
  }

  return null
}
