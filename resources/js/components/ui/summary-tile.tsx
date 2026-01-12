import React from 'react'

interface SummaryTileProps {
  title: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function SummaryTile({ title, children, className }: SummaryTileProps) {
  return (
    <div className={`p-3 rounded-lg border ${className ?? 'bg-muted/30'}`}>
      <div className="flex items-center gap-1 text-xs font-medium">{title}</div>
      <div className="font-semibold text-base mt-1">{children}</div>
    </div>
  )
}
