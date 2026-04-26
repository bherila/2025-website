'use client'

import currency from 'currency.js'
import { useEffect, useMemo, useState } from 'react'

import { Callout, fmtAmt, FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'

/** One closed lot row, shaped to match the `fin_account_lots` closed-status API response. */
export interface Form8949Lot {
  lot_id?: number
  acct_id?: number
  symbol: string | null
  description?: string | null
  quantity: number | string | null
  purchase_date: string | null
  cost_basis: number | string | null
  sale_date: string | null
  proceeds: number | string | null
  realized_gain_loss: number | string | null
  is_short_term: number | boolean
  /** 'broker_statement', '1099b', 'manual', etc. Drives the A/B/C vs. D/E/F box split. */
  lot_source?: string | null
  tax_document_id?: number | null
}

export type Form8949Box = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'

export interface Form8949Row {
  description: string
  dateAcquired: string
  dateSold: string
  proceeds: number
  basis: number
  code: string
  adjustment: number
  gain: number
  isShortTerm: boolean
  box: Form8949Box
}

export interface Form8949Section {
  box: Form8949Box
  label: string
  rows: Form8949Row[]
  totals: { proceeds: number; basis: number; adjustment: number; gain: number }
}

export interface Form8949Data {
  shortTerm: Form8949Section[]
  longTerm: Form8949Section[]
  partITotals: { proceeds: number; basis: number; adjustment: number; gain: number }
  partIITotals: { proceeds: number; basis: number; adjustment: number; gain: number }
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }
  return 0
}

function toBool(v: unknown): boolean {
  return v === true || v === 1 || v === '1'
}

/**
 * Box A/D = basis reported to IRS, B/E = basis not reported, C/F = not on a 1099-B.
 * `lot_source` is our proxy: '1099b' → A/D, 'broker_statement' / 'broker' → B/E,
 * anything else (including 'manual') → C/F. Future refinement could pull a
 * per-lot `basis_reported` flag from the 1099-B itself.
 */
export function classifyBox(lot: Form8949Lot): Form8949Box {
  const shortTerm = toBool(lot.is_short_term)
  const src = (lot.lot_source ?? '').toLowerCase()
  if (src === '1099b' || src === '1099_b') {
    return shortTerm ? 'A' : 'D'
  }
  if (src === 'broker_statement' || src === 'broker') {
    return shortTerm ? 'B' : 'E'
  }
  return shortTerm ? 'C' : 'F'
}

const BOX_LABELS: Record<Form8949Box, string> = {
  A: 'Short-term — Box A (basis reported to IRS)',
  B: 'Short-term — Box B (basis not reported)',
  C: 'Short-term — Box C (not on a 1099-B)',
  D: 'Long-term — Box D (basis reported to IRS)',
  E: 'Long-term — Box E (basis not reported)',
  F: 'Long-term — Box F (not on a 1099-B)',
}

export function computeForm8949(lots: Form8949Lot[]): Form8949Data {
  const rowsByBox = new Map<Form8949Box, Form8949Row[]>()

  for (const lot of lots) {
    const isShortTerm = toBool(lot.is_short_term)
    const box = classifyBox(lot)
    const proceeds = toNum(lot.proceeds)
    const basis = toNum(lot.cost_basis)
    const gain = toNum(lot.realized_gain_loss)
    // Adjustment column: proceeds - basis - adjustment = gain → adjustment = proceeds - basis - gain.
    const adjustment = currency(proceeds).subtract(basis).subtract(gain).value
    const code = Math.abs(adjustment) > 0.005 ? 'W' : ''

    const row: Form8949Row = {
      description: lot.description?.trim() || lot.symbol || 'Unknown',
      dateAcquired: lot.purchase_date ?? 'Various',
      dateSold: lot.sale_date ?? '',
      proceeds,
      basis,
      code,
      adjustment,
      gain,
      isShortTerm,
      box,
    }
    if (!rowsByBox.has(box)) rowsByBox.set(box, [])
    rowsByBox.get(box)!.push(row)
  }

  const buildSection = (box: Form8949Box): Form8949Section | null => {
    const rows = rowsByBox.get(box) ?? []
    if (rows.length === 0) return null
    const totals = rows.reduce(
      (acc, r) => ({
        proceeds: currency(acc.proceeds).add(r.proceeds).value,
        basis: currency(acc.basis).add(r.basis).value,
        adjustment: currency(acc.adjustment).add(r.adjustment).value,
        gain: currency(acc.gain).add(r.gain).value,
      }),
      { proceeds: 0, basis: 0, adjustment: 0, gain: 0 },
    )
    return { box, label: BOX_LABELS[box], rows, totals }
  }

  const shortTerm = (['A', 'B', 'C'] as const).map(buildSection).filter((s): s is Form8949Section => s !== null)
  const longTerm = (['D', 'E', 'F'] as const).map(buildSection).filter((s): s is Form8949Section => s !== null)

  const sumSections = (sections: Form8949Section[]) =>
    sections.reduce(
      (acc, s) => ({
        proceeds: currency(acc.proceeds).add(s.totals.proceeds).value,
        basis: currency(acc.basis).add(s.totals.basis).value,
        adjustment: currency(acc.adjustment).add(s.totals.adjustment).value,
        gain: currency(acc.gain).add(s.totals.gain).value,
      }),
      { proceeds: 0, basis: 0, adjustment: 0, gain: 0 },
    )

  return {
    shortTerm,
    longTerm,
    partITotals: sumSections(shortTerm),
    partIITotals: sumSections(longTerm),
  }
}

interface Form8949PreviewProps {
  selectedYear: number
}

const ROW_CAP = 50

export default function Form8949Preview({ selectedYear }: Form8949PreviewProps) {
  const [lots, setLots] = useState<Form8949Lot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = (await fetchWrapper.get(
          `/api/finance/all/lots?status=closed&year=${selectedYear}`,
        )) as { lots?: Form8949Lot[] }
        if (cancelled) return
        setLots(Array.isArray(res.lots) ? res.lots : [])
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load lots')
        setLots([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedYear])

  const data = useMemo(() => computeForm8949(lots ?? []), [lots])

  if (lots === null) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">Loading Form 8949 transactions…</div>
    )
  }

  if (error) {
    return (
      <Callout kind="warn" title="Unable to load lot data">
        <p>{error}</p>
      </Callout>
    )
  }

  if (lots.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No closed lots for {selectedYear}. Form 8949 reports per-transaction detail for
        securities sold during the year. Import a 1099-B or use the Lot Analyzer in the
        account view to populate this form.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 8949 — Sales &amp; Other Dispositions of Capital Assets</h2>
        <p className="text-xs text-muted-foreground">
          Per-transaction detail backing Schedule D Part I (short-term) and Part II (long-term).
        </p>
      </div>

      {data.shortTerm.length === 0 && data.longTerm.length === 0 && (
        <FormLine label="No reportable transactions for this year" raw="—" />
      )}

      {data.shortTerm.length > 0 && (
        <FormBlock title="Part I — Short-Term Capital Gains &amp; Losses">
          {data.shortTerm.map((section) => (
            <SectionRows key={section.box} section={section} showAll={showAll} />
          ))}
          <FormTotalLine
            label={`Part I totals — Proceeds ${fmtAmt(data.partITotals.proceeds)} · Basis ${fmtAmt(data.partITotals.basis)} · Net`}
            value={data.partITotals.gain}
          />
        </FormBlock>
      )}

      {data.longTerm.length > 0 && (
        <FormBlock title="Part II — Long-Term Capital Gains &amp; Losses">
          {data.longTerm.map((section) => (
            <SectionRows key={section.box} section={section} showAll={showAll} />
          ))}
          <FormTotalLine
            label={`Part II totals — Proceeds ${fmtAmt(data.partIITotals.proceeds)} · Basis ${fmtAmt(data.partIITotals.basis)} · Net`}
            value={data.partIITotals.gain}
          />
        </FormBlock>
      )}

      <Callout kind="info" title="Form 8949 totals → Schedule D">
        <p>
          Part I totals flow to Schedule D line 1b/2/3 (by box) · Part II totals flow to Schedule D
          line 8b/9/10. Transactions marked with code <strong>W</strong> have a wash-sale adjustment in
          column (g); other codes (D, E, T, etc.) would also appear here once surfaced from lot metadata.
        </p>
      </Callout>

      {!showAll && lotOverCap(data) && (
        <div className="text-center">
          <Button size="sm" variant="outline" onClick={() => setShowAll(true)}>
            Show all transactions
          </Button>
        </div>
      )}
    </div>
  )
}

function lotOverCap(data: Form8949Data): boolean {
  return [...data.shortTerm, ...data.longTerm].some((s) => s.rows.length > ROW_CAP)
}

function SectionRows({ section, showAll }: { section: Form8949Section; showAll: boolean }) {
  const visible = showAll ? section.rows : section.rows.slice(0, ROW_CAP)
  const hiddenCount = section.rows.length - visible.length
  return (
    <div className="divide-y divide-dashed divide-border/40">
      <div className="bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {section.label} · {section.rows.length} transaction{section.rows.length === 1 ? '' : 's'}
      </div>
      <div className="grid grid-cols-[2fr_repeat(5,minmax(0,1fr))_auto] items-center gap-2 bg-muted/10 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>Description</span>
        <span className="text-right">Acquired</span>
        <span className="text-right">Sold</span>
        <span className="text-right">Proceeds</span>
        <span className="text-right">Basis</span>
        <span className="text-right">Gain/(Loss)</span>
        <span className="w-6 text-right">Code</span>
      </div>
      {visible.map((row, i) => (
        <div
          key={i}
          className="grid grid-cols-[2fr_repeat(5,minmax(0,1fr))_auto] items-center gap-2 px-3 py-1 text-[11px] tabular-nums"
        >
          <span className="truncate">{row.description}</span>
          <span className="text-right font-mono">{row.dateAcquired}</span>
          <span className="text-right font-mono">{row.dateSold}</span>
          <span className="text-right font-mono">{fmtAmt(row.proceeds)}</span>
          <span className="text-right font-mono">{fmtAmt(row.basis)}</span>
          <span className={`text-right font-mono ${row.gain < 0 ? 'text-destructive' : ''}`}>{fmtAmt(row.gain)}</span>
          <span className="w-6 text-right font-mono text-amber-600 dark:text-amber-400">{row.code}</span>
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="bg-muted/20 px-3 py-1 text-center text-[11px] italic text-muted-foreground">
          {hiddenCount} more transaction{hiddenCount === 1 ? '' : 's'} hidden · click "Show all transactions" below
        </div>
      )}
      <div className="grid grid-cols-[2fr_repeat(5,minmax(0,1fr))_auto] items-center gap-2 bg-muted/20 px-3 py-1 text-[11px] font-semibold tabular-nums">
        <span>Totals ({section.box})</span>
        <span></span>
        <span></span>
        <span className="text-right font-mono">{fmtAmt(section.totals.proceeds)}</span>
        <span className="text-right font-mono">{fmtAmt(section.totals.basis)}</span>
        <span className={`text-right font-mono ${section.totals.gain < 0 ? 'text-destructive' : ''}`}>{fmtAmt(section.totals.gain)}</span>
        <span className="w-6 text-right font-mono">
          {Math.abs(section.totals.adjustment) > 0.005 ? fmtAmt(section.totals.adjustment) : ''}
        </span>
      </div>
    </div>
  )
}
