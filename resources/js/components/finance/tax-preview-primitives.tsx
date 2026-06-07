'use client'

import currency from 'currency.js'
import { ArrowRight, ArrowUpRight, HelpCircle, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { parseMoney } from '@/lib/finance/money'

const CURRENCY_TEXT = 'font-currency tabular-nums'
const BOX_REF_CLASS = 'text-[10px] text-muted-foreground w-10 shrink-0 select-none'

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
  if (n === null) return <span className={`text-muted-foreground ${className}`}>—</span>
  if (n === 0) return <span className={`${CURRENCY_TEXT} text-foreground ${className}`}>$0</span>
  const cls = n < 0 ? 'text-destructive' : 'text-success'
  return <span className={`${CURRENCY_TEXT} ${cls} ${className}`}>{fmtAmt(n)}</span>
}

// ── Shared details button ─────────────────────────────────────────────────────

/**
 * Where a "go to source" / drill affordance leads, which determines its trailing glyph:
 * - `'column'` → `→` (ArrowRight): pushes a Miller column within the dock.
 * - `'window'` → `↗` (ArrowUpRight): opens a new window / overlay (e.g. a document review modal).
 */
export type NavGlyph = 'column' | 'window'

export function NavGlyphIcon({ glyph, className = 'h-3 w-3' }: { glyph: NavGlyph; className?: string }) {
  const Icon = glyph === 'column' ? ArrowRight : ArrowUpRight
  return <Icon aria-hidden="true" className={className} />
}

export function DetailsButton({
  onClick,
  isReviewed,
  tooltip = 'View Details',
  glyph,
}: {
  onClick: () => void
  isReviewed?: boolean | undefined
  tooltip?: string
  /** Appends a navigation glyph after the label: `→` (column push) or `↗` (new window). */
  glyph?: NavGlyph
}) {
  const colorClass = isReviewed === false
    ? 'border-warning/70 text-warning hover:bg-warning/10 hover:text-warning'
    : 'border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`h-7 w-7 shrink-0 ${colorClass}`}
          onClick={(e) => { e.stopPropagation(); onClick() }}
          aria-label={tooltip}
        >
          {glyph ? <NavGlyphIcon glyph={glyph} /> : <Search className="h-3.5 w-3.5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Icon-only action button matching {@link DetailsButton}'s footprint, for row
 * actions that aren't source/drill navigation (e.g. edit/delete). Keeps custom
 * table layouts visually consistent with the shared tax-preview controls.
 */
export function IconActionButton({
  onClick,
  tooltip,
  icon,
  tone = 'neutral',
}: {
  onClick: () => void
  tooltip: string
  icon: React.ReactNode
  tone?: 'neutral' | 'danger'
}) {
  const toneClass = tone === 'danger'
    ? 'border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive dark:border-destructive/50'
    : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={`h-7 w-7 shrink-0 ${toneClass}`}
          onClick={(e) => { e.stopPropagation(); onClick() }}
          aria-label={tooltip}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Header button that drills into the All-in-One K-1 view (pushes a Miller column).
 * The `ArrowRight` icon signals a column push, matching the dock's drill convention.
 */
export function OpenAllK1Button({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onClick}>
      View all K-1s
      <ArrowRight className="h-3 w-3" />
    </Button>
  )
}

/** Header button that drills into the All-in-One K-3 (foreign income & tax) view. */
export function OpenAllK3Button({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onClick}>
      View all K-3s
      <ArrowRight className="h-3 w-3" />
    </Button>
  )
}

export function InfoTooltip({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More information"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground align-middle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-snug">{children}</TooltipContent>
    </Tooltip>
  )
}

// ── Form-block card primitives ────────────────────────────────────────────────

export function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border/60 rounded-lg overflow-hidden text-sm">
      <div className="bg-muted/40 px-3 py-2 text-xs font-semibold tracking-wide border-b border-border/60">{title}</div>
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
  detailsTooltip,
  detailsGlyph,
  destinationTooltip,
  destinationGlyph,
  isReviewed,
  control,
}: {
  boxRef?: string
  label: React.ReactNode
  value?: string | number | null
  raw?: string
  note?: boolean
  onClick?: () => void
  onDetails?: () => void
  detailsTooltip?: string
  /** Navigation glyph for the details button: `→` (Miller column push) or `↗` (new window). */
  detailsGlyph?: NavGlyph
  destinationTooltip?: string
  /** Navigation glyph for the destination button; defaults to a Miller-column push. */
  destinationGlyph?: NavGlyph
  isReviewed?: boolean | undefined
  /** Custom right-side control (e.g. a number input). When provided, replaces the value display. */
  control?: React.ReactNode
}) {
  const n = typeof value === 'number' ? value : parseFieldVal(value as string | null | undefined)
  const cls = isReviewed === false ? 'text-warning' : n === null ? '' : n < 0 ? 'text-destructive' : 'text-success'

  if (note) {
    return (
      <div className="px-3 py-1.5 space-y-0.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <p className="text-[12px] text-muted-foreground leading-snug">{raw}</p>
      </div>
    )
  }

  if (control) {
    return (
      <div className={`grid ${boxRef ? 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(5.75rem,auto)_2rem]' : 'grid-cols-[minmax(0,1fr)_minmax(5.75rem,auto)_2rem]'} items-center gap-2 px-3 py-1.5`}>
        {boxRef && <span className={BOX_REF_CLASS}>{boxRef}.</span>}
        <span className="text-[13px]">{label}</span>
        <span className="justify-self-end">{control}</span>
        <span aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className={`grid ${boxRef ? 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(5.75rem,7rem)_2rem]' : 'grid-cols-[minmax(0,1fr)_minmax(5.75rem,7rem)_2rem]'} items-start gap-2 px-3 py-1.5`}
    >
      {boxRef && <span className={`${BOX_REF_CLASS} pt-0.5`}>{boxRef}.</span>}
      <span className="min-w-0 text-[13px]">{label}</span>
      <span className={`${CURRENCY_TEXT} text-[13px] justify-self-end text-right break-words ${cls}`}>
        {raw ?? (n === null ? '—' : fmtAmt(n))}
      </span>
      <span className="flex flex-col items-end gap-1">
        {onDetails && (
          <DetailsButton
            onClick={onDetails}
            isReviewed={isReviewed}
            {...(detailsTooltip ? { tooltip: detailsTooltip } : {})}
            {...(detailsGlyph ? { glyph: detailsGlyph } : {})}
          />
        )}
        {onClick && (
          <DetailsButton
            onClick={onClick}
            tooltip={destinationTooltip ?? 'Open related form'}
            glyph={destinationGlyph ?? 'column'}
          />
        )}
      </span>
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

export function FactsLoadingPlaceholder({ label }: { label: string }) {
  return (
    <div className="py-12 text-center text-sm text-muted-foreground">
      {label} facts are not loaded yet.
    </div>
  )
}

export function FormTotalLine({
  label,
  value,
  double,
  boxRef,
  onClick,
  isReviewed,
  onDetails,
  detailsTooltip,
  detailsGlyph,
  destinationTooltip,
  destinationGlyph,
}: {
  label: React.ReactNode
  value: number | null
  double?: boolean
  boxRef?: string
  onClick?: () => void
  isReviewed?: boolean | undefined
  onDetails?: () => void
  detailsTooltip?: string
  /** Navigation glyph for the details button: `→` (Miller column push) or `↗` (new window). */
  detailsGlyph?: NavGlyph
  destinationTooltip?: string
  /** Navigation glyph for the destination button; defaults to a Miller-column push. */
  destinationGlyph?: NavGlyph
}) {
  const cls =
    isReviewed === false ? 'text-warning' : value === null ? 'text-muted-foreground' : value < 0 ? 'text-destructive' : 'text-success'
  const content = (
    <>
      {boxRef && <span className={BOX_REF_CLASS}>{boxRef}.</span>}
      <span className="min-w-0 text-[13px]">{label}</span>
      <span className={`${CURRENCY_TEXT} text-[13px] justify-self-end text-right ${cls}`}>{value === null ? '—' : fmtAmt(value)}</span>
      <span className="flex flex-col items-end gap-1">
        {onDetails && (
          <DetailsButton
            onClick={onDetails}
            isReviewed={isReviewed}
            {...(detailsTooltip ? { tooltip: detailsTooltip } : {})}
            {...(detailsGlyph ? { glyph: detailsGlyph } : {})}
          />
        )}
        {onClick && (
          <DetailsButton
            onClick={onClick}
            tooltip={destinationTooltip ?? 'Open related form'}
            glyph={destinationGlyph ?? 'column'}
          />
        )}
      </span>
    </>
  )
  const className = `grid ${boxRef ? 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(5.75rem,7rem)_2rem]' : 'grid-cols-[minmax(0,1fr)_minmax(5.75rem,7rem)_2rem]'} items-center gap-2 px-3 py-2 text-left border-l-2 border-l-primary/40 ${double ? 'border-t-2 border-double border-border' : 'border-t border-border'} bg-primary/5`

  return (
    <div className={className}>
      {content}
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
