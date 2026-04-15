import type { ComponentProps } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PortalNavButtonProps extends ComponentProps<typeof Button> {
  /** When true, applies active/selected styling (accent background). */
  active?: boolean
}

/**
 * Wraps the shadcn Button (ghost variant) for use as a portal navigation link.
 *
 * Adds two overrides to prevent the global `a { text-primary; hover:underline }`
 * base style from turning these links gold and adding hover underlines:
 *   - text-foreground (inactive) / text-accent-foreground (active)
 *   - hover:no-underline
 */
export function PortalNavButton({ active = false, className, ...props }: PortalNavButtonProps) {
  return (
    <Button
      variant='ghost'
      size='sm'
      className={cn(
        'hover:no-underline',
        active ? 'bg-accent text-accent-foreground' : 'text-foreground',
        className,
      )}
      {...props}
    />
  )
}
