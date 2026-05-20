import { type ReactElement, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PortraitGameShellProps {
  children: ReactNode
  className?: string
  contentClassName?: string
}

const PORTRAIT_VIEWPORT_MAX_WIDTH = 'min(100vw, calc(100vh * 3 / 4))'

export function PortraitGameShell({
  children,
  className,
  contentClassName,
}: PortraitGameShellProps): ReactElement {
  return (
    <div className={cn('flex h-screen w-full justify-center overflow-hidden', className)}>
      <div
        className={cn('flex h-full min-w-0 flex-col', contentClassName)}
        data-testid="portrait-game-viewport"
        style={{ maxWidth: PORTRAIT_VIEWPORT_MAX_WIDTH, width: '100%' }}
      >
        {children}
      </div>
    </div>
  )
}
