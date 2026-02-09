import * as React from "react"

import { cn } from "@/lib/utils"

type ButtonGroupProps = React.HTMLAttributes<HTMLDivElement>;

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "inline-flex -space-x-px rounded-lg shadow-sm transition-shadow",
        className
      )}
      {...props}
    />
  )
)
ButtonGroup.displayName = "ButtonGroup"

export { ButtonGroup }
