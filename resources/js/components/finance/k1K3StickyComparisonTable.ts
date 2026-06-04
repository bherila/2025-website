const stickyFirstColumnShadow = 'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]'

export const stickyComparisonTableClasses = {
  scrollContainer: 'max-h-[calc(100vh-14rem)] overflow-auto rounded-lg border border-border/60',
  table: 'min-w-max table-fixed border-collapse text-sm',
  headerRow: 'sticky top-0 z-20 border-b border-border/60 bg-muted text-xs',
  cornerHeaderCell: `sticky top-0 left-0 z-30 w-[260px] bg-muted px-3 py-2 text-left font-semibold ${stickyFirstColumnShadow}`,
  headerCell: 'sticky top-0 z-20 bg-muted px-3 py-2 font-semibold',
  totalHeaderCell: 'sticky top-0 z-20 w-[140px] border-l border-border/60 bg-primary/5 px-3 py-2 text-right font-semibold text-primary',
  firstColumnCell: `sticky left-0 z-10 w-[260px] bg-background px-3 py-1.5 ${stickyFirstColumnShadow}`,
  sectionFirstColumnCell: `sticky left-0 z-10 w-[260px] border-l-2 border-info/60 bg-info/10 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-info ${stickyFirstColumnShadow}`,
  sectionFillCell: 'bg-info/10 px-3 py-1.5',
} as const
