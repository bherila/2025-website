'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import type { FK1StructuredData, K1CodeItem } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Main component ────────────────────────────────────────────────────────────

interface ScheduleDPreviewProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  selectedYear?: number
}

export default function ScheduleDPreview({ reviewedK1Docs, reviewed1099Docs, selectedYear }: ScheduleDPreviewProps) {
  const taxYear = selectedYear ?? new Date().getFullYear()
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  if (k1Parsed.length === 0 && reviewed1099Docs.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        No reviewed documents found. Review K-1 and 1099-B documents to see Schedule D analysis.
      </div>
    )
  }

  // ── Form 6781 — Section 1256 ──────────────────────────────────────────────
  type Sec1256Source = { label: string; amount: number; lt: number; st: number }
  const sec1256Sources: Sec1256Source[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const cItems = (data.codes['11'] ?? []).filter((i: K1CodeItem) => i.code === 'C')
    for (const item of cItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n !== 0) {
        sec1256Sources.push({
          label: `${partnerName} — K-1 Box 11C`,
          amount: n,
          lt: currency(n).multiply(0.6).value,
          st: currency(n).multiply(0.4).value,
        })
      }
    }
  }

  const total6781 = sec1256Sources.reduce((acc, source) => acc.add(source.amount), currency(0)).value
  const total6781LT = sec1256Sources.reduce((acc, source) => acc.add(source.lt), currency(0)).value
  const total6781ST = sec1256Sources.reduce((acc, source) => acc.add(source.st), currency(0)).value

  // ── Short-term capital gains/losses ──────────────────────────────────────
  type CapGainLine = { label: string; amount: number; note?: string }
  const stLines: CapGainLine[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const box8 = pk1(data, '8')
    if (box8 !== 0) {
      stLines.push({ label: `${partnerName} — K-1 Box 8`, amount: box8 })
    }
  }

  // Form 6781 40% ST allocation
  if (total6781ST !== 0) {
    stLines.push({
      label: 'Form 6781 40% S/T allocation (Sec. 1256)',
      amount: total6781ST,
      note: '40% of Section 1256 gain/(loss) is always short-term',
    })
  }

  // 1099-B placeholder
  const has1099B = reviewed1099Docs.some(
    (d) => d.form_type === '1099_b' || d.form_type === '1099_b_c',
  )
  if (!has1099B) {
    stLines.push({
      label: 'Brokerage 1099-B (not yet uploaded)',
      amount: 0,
      note: 'Upload 1099-B for short-term transaction detail',
    })
  }

  // ── Long-term capital gains/losses ────────────────────────────────────────
  const ltLines: CapGainLine[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const box9a = pk1(data, '9a')
    const box9b = pk1(data, '9b')
    const box9c = pk1(data, '9c')
    const box10 = pk1(data, '10')

    if (box9a !== 0) ltLines.push({ label: `${partnerName} — K-1 Box 9a (L/T)`, amount: box9a })
    if (box9b !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 9b (28% rate)`, amount: box9b, note: '28% collectibles rate' })
    if (box9c !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 9c (§1250 unrec.)`, amount: box9c, note: 'Unrecaptured §1250 gain' })
    if (box10 !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 10 (§1231)`, amount: box10, note: '§1231 gain flows to Part II' })
  }

  // Form 6781 60% LT allocation
  if (total6781LT !== 0) {
    ltLines.push({
      label: 'Form 6781 60% L/T allocation (Sec. 1256)',
      amount: total6781LT,
      note: '60% of Section 1256 gain/(loss) is always long-term',
    })
  }

  if (!has1099B) {
    ltLines.push({
      label: 'Brokerage 1099-B (not yet uploaded)',
      amount: 0,
      note: 'Upload 1099-B for long-term transaction detail',
    })
  }

  // ── Totals ────────────────────────────────────────────────────────────────
  const netST = stLines.reduce((acc, line) => acc.add(line.amount), currency(0)).value
  const netLT = ltLines.reduce((acc, line) => acc.add(line.amount), currency(0)).value
  const combined = currency(netST).add(netLT).value

  const annualCapLoss = 3000
  const appliedToReturn = combined < 0 ? Math.max(combined, -annualCapLoss) : 0
  const carryforward = combined < 0 ? currency(combined).subtract(appliedToReturn).value : 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold mb-0.5">Schedule D — Capital Gains &amp; Losses</h2>
        <p className="text-xs text-muted-foreground">
          Capital gains, losses, and Section 1256 contract analysis.
        </p>
      </div>

      {/* Form 6781 */}
      {sec1256Sources.length > 0 && (
        <>
          <FormBlock title="Form 6781 — Section 1256 Contracts &amp; Straddles">
            {sec1256Sources.map((src, i) => (
              <div key={i}>
                <FormLine label={src.label} value={src.amount} />
                <FormSubLine
                  text={`60% long-term = ${fmtAmt(src.lt)} · 40% short-term = ${fmtAmt(src.st)} → Form 6781 Part I`}
                />
              </div>
            ))}
            <FormTotalLine label="Total Sec. 1256 gain/(loss)" value={total6781} />
          </FormBlock>
          <Callout kind="info" title="ℹ Section 1256 Contracts">
            <p>
              Section 1256 contracts are marked to market at year-end. 60% of the gain/loss is treated as long-term
              regardless of holding period. Enter on Form 6781, Part I. The 60%/40% split then flows to Schedule D.
            </p>
          </Callout>
        </>
      )}

      {/* Part I and II */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormBlock title="Schedule D Part I — Short-Term">
          {stLines.map((line, i) => (
            <div key={i}>
              <FormLine label={line.label} value={line.amount} />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          {stLines.length === 0 && <FormLine label="No short-term items" raw="—" />}
          <FormTotalLine label="Part I Net Short-Term" value={netST} />
        </FormBlock>

        <FormBlock title="Schedule D Part II — Long-Term">
          {ltLines.map((line, i) => (
            <div key={i}>
              <FormLine label={line.label} value={line.amount} />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          {ltLines.length === 0 && <FormLine label="No long-term items" raw="—" />}
          <FormTotalLine label="Part II Net Long-Term" value={netLT} />
        </FormBlock>
      </div>

      {/* Summary */}
      <FormBlock title="Schedule D Summary">
        <FormLine label="Net short-term capital gain (loss)" value={netST} />
        <FormLine label="Net long-term capital gain (loss)" value={netLT} />
        <FormTotalLine label="Combined net capital gain (loss)" value={combined} />
        {combined < 0 && (
          <>
            <FormLine
              label={`Capital loss applied to ${taxYear} return`}
              value={appliedToReturn}
            />
            <FormLine
              label={`Capital loss carryforward to ${taxYear + 1}`}
              value={carryforward}
            />
          </>
        )}
      </FormBlock>

      {carryforward < 0 && Math.abs(carryforward) > 5000 && (
        <Callout kind="warn" title="⚠ Large Capital Loss Carryforward">
          <p>
            ~<strong>{fmtAmt(Math.abs(carryforward))}</strong> carries to next year (only $3,000 allowed annually).
            Confirm exact ST/LT split from your completed Schedule D to determine character of carryforward.
          </p>
        </Callout>
      )}

      {!has1099B && (
        <Callout kind="info" title="ℹ 1099-B Not Yet Uploaded">
          <p>
            Brokerage 1099-B is not yet in the reviewed documents. Upload and review 1099-B statements in the
            Overview tab (All Tax Documents section) to include brokerage transactions in this analysis.
          </p>
        </Callout>
      )}
    </div>
  )
}
