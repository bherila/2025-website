'use client'

import currency from 'currency.js'
import { ChevronRight, HelpCircle, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { parseMoney } from '@/lib/finance/money'

// ── Value helpers ─────────────────────────────────────────────────────────────

export function parseFieldVal(v: string | null | undefined): number | null {
  return parseMoney(v)
}

export function parseCurrencyInput(raw: string): number {
  const sanitized = raw.replace(/[^0-9.]/g, '')
  const [whole = '', ...decimals] = sanitized.split('.')
  const normalized = decimals.length > 0
    ? `${whole}.${decimals.join('')}`
    : whole
  return parseMoney(normalized) ?? 0
}

export function fmtAmt(n: number, precision = 0): string {
  const abs = currency(Math.abs(n), { precision }).format()
  return n < 0 ? `(${abs})` : abs
}

export function AmountCell({ val, className = '' }: { val: string | number | null | undefined; className?: string }) {
  const n = typeof val === 'number' ? val : parseFieldVal(val as string | null | undefined)
  if (n === null) return <span className={`font-mono text-muted-foreground ${className}`}>—</span>
  if (n === 0) return <span className={`font-mono text-foreground ${className}`}>$0</span>
  const cls = n < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'
  return <span className={`font-mono tabular-nums ${cls} ${className}`}>{fmtAmt(n)}</span>
}

// ── Shared details button ─────────────────────────────────────────────────────

export function DetailsButton({ onClick, isReviewed }: { onClick: () => void; isReviewed?: boolean }) {
  const colorClass = isReviewed === undefined
    ? 'text-muted-foreground hover:text-foreground'
    : isReviewed
      ? 'text-green-700 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300'
      : 'text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-5 w-5 shrink-0 ${colorClass}`}
          onClick={(e) => { e.stopPropagation(); onClick() }}
        >
          <Search className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>View Details</TooltipContent>
    </Tooltip>
  )
}

export function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground align-middle">
          <HelpCircle className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-snug">{children}</TooltipContent>
    </Tooltip>
  )
}

// ── Form-block card primitives ────────────────────────────────────────────────

export function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg overflow-hidden text-sm">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide border-b">{title}</div>
      <div className="divide-y divide-dashed divide-border/50">{children}</div>
    </div>
  )
}

export function FormLine({
  boxRef,
  label,
  value,
  raw,
  note,
  onClick,
  onDetails,
  control,
}: {
  boxRef?: string
  label: React.ReactNode
  value?: string | number | null
  raw?: string
  note?: boolean
  onClick?: () => void
  onDetails?: () => void
  /** Custom right-side control (e.g. a number input). When provided, replaces the value display. */
  control?: React.ReactNode
}) {
  const n = typeof value === 'number' ? value : parseFieldVal(value as string | null | undefined)
  const cls = n === null ? '' : n < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'

  if (note) {
    return (
      <div className="px-3 py-1.5 space-y-0.5">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <p className="text-[12px] text-muted-foreground leading-snug">{raw}</p>
      </div>
    )
  }

  if (control) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0 select-none">{boxRef ? `${boxRef}.` : ''}</span>
        <span className="flex-1 text-[13px]">{label}</span>
        <span className="shrink-0">{control}</span>
      </div>
    )
  }

  return (
    <div
      className={`flex items-start gap-2 px-3 py-1.5 ${onClick ? 'cursor-pointer hover:bg-muted/20 transition-colors' : ''}`}
      onClick={onClick}
    >
      <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0 select-none pt-0.5">{boxRef ? `${boxRef}.` : ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      <span className={`font-mono tabular-nums text-[13px] min-w-[80px] max-w-[45%] text-right break-words ${cls}`}>
        {raw ?? (n === null ? '—' : fmtAmt(n))}
      </span>
      {onClick && <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-0.5" />}
      {onDetails && <DetailsButton onClick={onDetails} />}
      {!onClick && !onDetails && <span className="w-5 shrink-0" />}
    </div>
  )
}

export function FormSubLine({ text }: { text: string }) {
  return (
    <div className="px-3 py-0.5 pl-[4.5rem]">
      <span className="text-[11px] text-muted-foreground leading-tight">{text}</span>
    </div>
  )
}

export function FormTotalLine({ label, value, double, boxRef }: { label: string; value: number | null; double?: boolean; boxRef?: string }) {
  const cls =
    value === null ? 'text-muted-foreground' : value < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-500'
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border-l-2 border-l-primary/40 ${double ? 'border-t-2 border-double border-border' : 'border-t border-border'} bg-primary/5`}
    >
      <span className="text-[10px] font-mono text-muted-foreground w-10 shrink-0 select-none">{boxRef ? `${boxRef}.` : ''}</span>
      <span className="flex-1 text-[13px]">{label}</span>
      <span className={`font-mono text-[13px] tabular-nums min-w-[80px] text-right ${cls}`}>{value === null ? '—' : fmtAmt(value)}</span>
    </div>
  )
}

// ── Callout component ─────────────────────────────────────────────────────────

export type CalloutKind = 'good' | 'warn' | 'info' | 'alert'

const CALLOUT_STYLES: Record<CalloutKind, string> = {
  good: 'border-success/30 bg-success/10 text-success',
  warn: 'border-warning/40 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
  alert: 'border-destructive/30 bg-destructive/10 text-destructive',
}

export function Callout({
  kind,
  title,
  children,
}: {
  kind: CalloutKind
  title: string
  children: React.ReactNode
}) {
  return (
    <div className={`border rounded-lg p-3 space-y-1 ${CALLOUT_STYLES[kind]}`}>
      <div className="text-xs font-semibold">{title}</div>
      <div className="text-xs leading-relaxed space-y-1">{children}</div>
    </div>
  )
}
