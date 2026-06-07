'use client'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { k1CodeSourceFieldId, k1FieldSourceFieldId } from '@/lib/finance/taxSourceFieldIds'
import type { Form4952CalculationRow, Form4952Facts, TaxFactSource } from '@/types/generated/tax-preview-facts'

import { fmtAmt, NavGlyphIcon } from './tax-preview-primitives'

type AmountMode = 'signed' | 'absolute' | 'expense'

/** The K-1 box/code review focus field a source maps to, if any. */
export function focusFieldIdFor(source: TaxFactSource): string | undefined {
  if (source.box && source.code) {
    return k1CodeSourceFieldId(source.box, source.code)
  }
  if (source.box) {
    return k1FieldSourceFieldId(source.box)
  }
  return undefined
}

export interface Form4952DetailPayload {
  title: string
  description?: string
  sources: TaxFactSource[]
  calculationRows: Form4952CalculationRow[]
  amountMode: AmountMode
}

/**
 * Resolves the detail payload behind a Form 4952 line from a stable instance key.
 *
 * This consolidates what used to be built inline as modal state in
 * {@link Form4952Preview}. Each key corresponds to one detail affordance (a
 * magnifying-glass control on a line); the returned payload drives the
 * {@link Form4952DetailColumn} that opens as a Miller column. Returns `null`
 * when the key is unknown (e.g. a stale route after the facts changed).
 */
export function form4952DetailColumn(facts: Form4952Facts, key: string | undefined): Form4952DetailPayload | null {
  switch (key) {
    case 'line-4a-k1':
      return {
        title: 'Gross investment income from K-1s (line 4a)',
        description: 'Each partnership’s share of investment income that feeds Form 4952 line 4a. Net capital gain is excluded.',
        sources: facts.grossInvestmentIncomeFromK1Sources,
        calculationRows: [],
        amountMode: 'signed',
      }
    case 'line-4a':
      return {
        title: 'Line 4a gross investment income',
        description: 'How Form 4952 line 4a is assembled from Schedule B and K-1 investment income.',
        sources: facts.grossInvestmentIncomeFromK1Sources,
        calculationRows: facts.line4aCalculationRows,
        amountMode: 'signed',
      }
    case 'line-4b':
      return {
        title: 'Qualified dividends included on line 4a (line 4b)',
        description: 'These qualified dividends are subtracted on line 4b. Go to each source to verify.',
        sources: facts.qualifiedDividendSources,
        calculationRows: [],
        amountMode: 'signed',
      }
    case 'line-4c':
      return {
        title: 'Line 4c income after qualified dividends',
        description: 'Line 4c subtracts qualified dividends included on line 4a unless they are elected back into investment income on line 4g.',
        sources: facts.qualifiedDividendSources,
        calculationRows: facts.line4cCalculationRows,
        amountMode: 'signed',
      }
    case 'line-4d':
      return {
        title: 'Line 4d net gain from disposition',
        description: 'Line 4d starts with the Schedule D net gain or loss, removes non-investment §1231 gain, then floors the result at $0.',
        sources: [],
        calculationRows: facts.line4dCalculationRows,
        amountMode: 'signed',
      }
    case 'line-4e':
      return {
        title: 'Line 4e net capital gain from disposition',
        description: 'Line 4e is the preferential long-term slice, capped by line 4d. It does not raise investment income unless elected on line 4g.',
        sources: [],
        calculationRows: facts.line4eCalculationRows,
        amountMode: 'signed',
      }
    default:
      break
  }

  if (key?.startsWith('dest-')) {
    const destinationKey = key.slice('dest-'.length)
    const destination = facts.carryDestinations.find((candidate) => candidate.destination === destinationKey)
    if (destination) {
      return {
        title: `${destination.label} — sources`,
        description: 'The individual investment-interest sources allocated to this destination.',
        sources: destination.sources,
        calculationRows: [],
        amountMode: 'expense',
      }
    }
  }

  return null
}

function displayAmount(amount: number, mode: AmountMode): number {
  if (mode === 'absolute') {
    return Math.abs(amount)
  }
  if (mode === 'expense') {
    return -Math.abs(amount)
  }
  return amount
}

function goToLabel(source: TaxFactSource): string {
  return source.formType === 'k1' ? 'Go to K-1' : 'Go to source'
}

/**
 * Lists the individual sources and calculation behind a Form 4952 line as a
 * drillable Miller column (replacing the former modal). From here a user can
 * push a further column into each source's document instead of dead-ending.
 */
export default function Form4952DetailColumn({
  facts,
  instanceKey,
  onGoToSource,
}: {
  facts: Form4952Facts
  instanceKey: string | undefined
  onGoToSource: (source: TaxFactSource) => void
}) {
  const payload = form4952DetailColumn(facts, instanceKey)

  if (!payload) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted-foreground">This Form 4952 detail is no longer available.</p>
      </div>
    )
  }

  const { title, description, sources, calculationRows, amountMode } = payload
  const hasCalculationRows = calculationRows.length > 0
  const hasSources = sources.length > 0

  return (
    <div className="space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {!hasCalculationRows && !hasSources ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No sources found.</p>
      ) : (
        <div className="space-y-3">
          {hasCalculationRows && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Calculation</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-8 text-right" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculationRows.map((row, index) => (
                    <TableRow key={`${row.label}-${index}`} className={row.role === 'result' ? 'bg-primary/5' : undefined}>
                      <TableCell className="text-sm">
                        <div className={row.role === 'result' ? 'font-semibold' : 'font-medium'}>{row.label}</div>
                        {row.note && <div className="text-[11px] leading-snug text-muted-foreground">{row.note}</div>}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-currency tabular-nums ${row.amount < 0 ? 'text-destructive' : 'text-success'}`}>
                        {fmtAmt(row.amount)}
                      </TableCell>
                      <TableCell aria-hidden="true" />
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {hasSources && (
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-8 text-right" aria-label="Actions" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell className="text-sm">
                        <div className="font-medium">{source.label}</div>
                        {source.notes && <div className="text-[11px] leading-snug text-muted-foreground">{source.notes}</div>}
                      </TableCell>
                      <TableCell className="text-right text-sm font-currency tabular-nums">
                        {fmtAmt(displayAmount(source.amount, amountMode))}
                      </TableCell>
                      <TableCell className="text-right">
                        {source.taxDocumentId != null || source.formType === '1099_div' ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="h-7 w-7 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700/70 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200"
                                aria-label={goToLabel(source)}
                                onClick={() => onGoToSource(source)}
                              >
                                <NavGlyphIcon glyph={source.taxDocumentId != null ? 'window' : 'column'} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{goToLabel(source)}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
