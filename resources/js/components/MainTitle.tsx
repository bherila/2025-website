import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

export default function MainTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 className={cn('scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl pt-5 pb-3', className)}>
      {children}
    </h1>
  )
}
