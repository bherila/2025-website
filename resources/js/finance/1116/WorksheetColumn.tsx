'use client'

import currency from 'currency.js'
import { ExternalLink, Loader2, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { Button } from '@/components/ui/button'
import { fetchWrapper } from '@/fetchWrapper'

import { calculateApportionedInterest } from './k3-to-1116'
import type { ForeignTaxSummary } from './types'

interface WorksheetColumnProps {
  foreignTaxSummaries: ForeignTaxSummary[]
  taxYear?: number
  /** Called when the user clicks "Go to source" for a document. */
  onOpenDoc?: (docId: number) => void
}

interface Lot {
  acct_id: number
  cost_basis: string | number
}

/**
 * Form 1116 Apportionment Worksheet rendered as a Miller column.
 * Inputs are formatted as label-left / input-right rows.
 */
export default function WorksheetColumn({ foreignTaxSummaries, taxYear, onOpenDoc }: WorksheetColumnProps) {
  const [totalInterest, setTotalInterest] = useState('')
  const [foreignBasis, setForeignBasis] = useState('')
  const [totalBasis, setTotalBasis] = useState('')
  const [loadingBasis, setLoadingBasis] = useState(false)
  const [suggestedValues, setSuggestedValues] = useState<{ foreign: number; total: number; lotCount: number; foreignLotCount: number } | null>(null)

  const totalForeignTax = useMemo(
    () => foreignTaxSummaries.reduce((sum, s) => currency(sum).add(s.totalForeignTaxPaid).value, 0),
    [foreignTaxSummaries],
  )

  const fetchBasisDiscovery = useCallback(async () => {
    setLoadingBasis(true)
    try {
      const asOf = taxYear ? `${taxYear}-12-31` : null
      const url = asOf ? `/api/finance/all/lots?as_of=${asOf}` : '/api/finance/all/lots?status=open'
      const data = await fetchWrapper.get(url) as { lots: Lot[] }
      const lots = data.lots || []

      const total = lots.reduce((sum, lot) => currency(sum).add(lot.cost_basis).value, 0)

      const foreignAccountIds = new Set(foreignTaxSummaries.map(s => s.accountId).filter(Boolean))
      const foreignLots = lots.filter(lot => foreignAccountIds.has(lot.acct_id))
      const foreign = foreignLots.reduce((sum, lot) => currency(sum).add(lot.cost_basis).value, 0)

      setSuggestedValues({ foreign, total, lotCount: lots.length, foreignLotCount: foreignLots.length })
    } catch {
      toast.error('Failed to discover adjusted basis from lots')
    } finally {
      setLoadingBasis(false)
    }
  }, [foreignTaxSummaries, taxYear])

  useEffect(() => {
    void fetchBasisDiscovery()
  }, [fetchBasisDiscovery])

  const applySuggestions = () => {
    if (suggestedValues) {
      setForeignBasis(String(suggestedValues.foreign))
      setTotalBasis(String(suggestedValues.total))
    }
  }

  const result = useMemo(() => {
    const ti = parseFloat(totalInterest) || 0
    const fb = parseFloat(foreignBasis) || 0
    const tb = parseFloat(totalBasis) || 0
    if (tb === 0) return null
    return calculateApportionedInterest(ti, fb, tb)
  }, [totalInterest, foreignBasis, totalBasis])

  const sourceLabel = taxYear
    ? `${taxYear}-12-31 lot snapshot`
    : 'open lots snapshot'

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Form 1116 Apportionment Worksheet</h2>
        <p className="text-xs text-muted-foreground">
          Asset method interest expense apportionment — Form 1116, Part I, Line 4b
        </p>
      </div>

      {/* Foreign tax summary */}
      {foreignTaxSummaries.length > 0 && (
        <FormBlock title="Foreign Taxes Paid (from reviewed documents)">
          {foreignTaxSummaries.map((s, i) => (
            <FormLine
              key={i}
              label={
                <span className="flex items-center gap-1.5">
                  <span className="capitalize">{s.sourceLabel ?? s.sourceType.replace('_', '-')}</span>
                  {s.category && <span className="text-[11px] text-muted-foreground">({s.category})</span>}
                  {s.sourceDocumentId && onOpenDoc && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] gap-0.5 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={(e) => { e.stopPropagation(); onOpenDoc(s.sourceDocumentId!) }}
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                      Go to source
                    </Button>
                  )}
                </span>
              }
              value={s.totalForeignTaxPaid}
            />
          ))}
          <FormTotalLine label="Total foreign taxes" value={totalForeignTax} />
        </FormBlock>
      )}

      {/* Asset method inputs */}
      <FormBlock title="Asset Method — Interest Expense Apportionment (Line 4b)">
        <FormLine
          note
          label="Formula"
          raw="Apportioned Interest = Total Interest × (Foreign Basis ÷ Total Basis)"
        />
        {suggestedValues && (
          <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-b border-dashed border-border/50">
            <span className="text-[11px] text-muted-foreground">
              {loadingBasis ? 'Loading suggested values…' : `Suggested from ${sourceLabel} (${suggestedValues.foreignLotCount} foreign / ${suggestedValues.lotCount} total lots)`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[10px] gap-1 text-primary hover:text-primary hover:bg-primary/5 shrink-0"
              onClick={applySuggestions}
              disabled={loadingBasis}
            >
              {loadingBasis ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              Use suggested
            </Button>
          </div>
        )}
        <FormLine
          label="Total investment interest expense ($)"
          control={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={totalInterest}
              onChange={e => setTotalInterest(e.target.value)}
              aria-label="Total investment interest expense"
              className="w-32 rounded border px-2 py-0.5 text-right text-[11px] bg-background"
            />
          }
        />
        <FormLine
          label={
            <span>
              Adjusted basis of foreign assets ($)
              {suggestedValues && !foreignBasis && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  Sug: {currency(suggestedValues.foreign).format()}
                </span>
              )}
            </span>
          }
          control={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={foreignBasis}
              onChange={e => setForeignBasis(e.target.value)}
              aria-label="Adjusted basis of foreign assets"
              className="w-32 rounded border px-2 py-0.5 text-right text-[11px] bg-background"
            />
          }
        />
        <FormLine
          label={
            <span>
              Adjusted basis of all assets ($)
              {suggestedValues && !totalBasis && (
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  Sug: {currency(suggestedValues.total).format()}
                </span>
              )}
            </span>
          }
          control={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={totalBasis}
              onChange={e => setTotalBasis(e.target.value)}
              aria-label="Adjusted basis of all assets"
              className="w-32 rounded border px-2 py-0.5 text-right text-[11px] bg-background"
            />
          }
        />
        {result && (
          <>
            <FormLine
              label="Foreign / total asset ratio"
              raw={`${(result.ratio * 100).toFixed(2)}%`}
            />
            <FormTotalLine
              boxRef="4b"
              label="Apportioned interest (Form 1116, Line 4b)"
              value={result.apportionedForeignInterest}
            />
          </>
        )}
      </FormBlock>

      {result && (
        <FormBlock title="Where This Goes">
          <FormLine
            note
            label="Form 1116, Part I, Line 4b"
            raw={`Enter ${currency(result.apportionedForeignInterest).format()} on Form 1116, Part I, Line 4b. This reduces passive foreign income before computing the FTC limitation fraction.`}
          />
        </FormBlock>
      )}
    </div>
  )
}
