'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { Callout, fmtAmt, FormBlock, FormLine, FormSubLine, FormTotalLine, parseFieldVal } from '@/components/finance/tax-preview-primitives'
import { getDocAmounts } from '@/lib/finance/taxDocumentUtils'
import { scheduleD } from '@/lib/tax/scheduleD'
import type { FK1StructuredData, K1CodeItem } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pk1(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

/** Read a numeric field from broker_1099 or 1099_b parsed_data. */
function readBrokerField(p: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const v = p[key]
    if (typeof v === 'number' && !isNaN(v)) return v
  }
  return 0
}

// ── Main component ────────────────────────────────────────────────────────────

interface ScheduleDPreviewProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  selectedYear?: number
}

export interface ScheduleDComputedData {
  schD: ReturnType<typeof scheduleD>
  netST: number
  netLT: number
  combined: number
  appliedToReturn: number
  carryforward: number
}

export function computeScheduleD(reviewedK1Docs: TaxDocument[], reviewed1099Docs: TaxDocument[]): ScheduleDComputedData {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const sec1256Sources: { amount: number; lt: number; st: number }[] = []
  for (const { data } of k1Parsed) {
    const cItems = (data.codes['11'] ?? []).filter((i: K1CodeItem) => i.code === 'C')
    for (const item of cItems) {
      const n = parseFieldVal(item.value) ?? 0
      if (n !== 0) {
        sec1256Sources.push({
          amount: n,
          lt: currency(n).multiply(0.6).value,
          st: currency(n).multiply(0.4).value,
        })
      }
    }
  }

  const total6781LT = sec1256Sources.reduce((acc, source) => acc.add(source.lt), currency(0)).value
  const total6781ST = sec1256Sources.reduce((acc, source) => acc.add(source.st), currency(0)).value

  const brokerSources = reviewed1099Docs
    .filter((d) => d.form_type === 'broker_1099' || d.form_type === '1099_b' || d.form_type === '1099_b_c')
    .map((doc) => {
      const p = (doc.parsed_data ?? {}) as Record<string, unknown>
      const stGain = readBrokerField(p, 'b_st_gain_loss', 'b_st_reported_gain_loss')
      const ltGain = readBrokerField(p, 'b_lt_gain_loss', 'b_lt_reported_gain_loss')
      const totalGain = readBrokerField(p, 'b_total_gain_loss', 'total_realized_gain_loss')
      if (stGain !== 0 || ltGain !== 0 || totalGain !== 0) {
        return {
          stGain: stGain || (totalGain !== 0 ? totalGain : 0),
          ltGain,
        }
      }
      return null
    })
    .filter((source): source is NonNullable<typeof source> => source !== null)

  const totalBrokerST = brokerSources.reduce((acc, s) => acc.add(s.stGain), currency(0)).value
  const totalBrokerLT = brokerSources.reduce((acc, s) => acc.add(s.ltGain), currency(0)).value

  const totalCapitalGainDistributions = reviewed1099Docs.reduce((acc, doc) => {
    const links = doc.account_links ?? []
    if (links.length > 0) {
      return links.reduce((linkAcc, link) => {
        if (link.form_type !== '1099_div' && link.form_type !== '1099_div_c') {
          return linkAcc
        }

        return linkAcc.add(getDocAmounts(doc, link).capGain ?? 0)
      }, acc)
    }

    if (doc.form_type !== '1099_div' && doc.form_type !== '1099_div_c') {
      return acc
    }

    return acc.add(getDocAmounts(doc).capGain ?? 0)
  }, currency(0)).value

  const k1ST = k1Parsed.reduce((acc, { data }) => acc.add(pk1(data, '8')), currency(0)).value
  const k1LT = k1Parsed.reduce((acc, { data }) => acc
    .add(pk1(data, '9a'))
    .add(pk1(data, '9b'))
    .add(pk1(data, '9c'))
    .add(pk1(data, '10')), currency(0)).value

  const schD = scheduleD({
    line1a_gain_loss: totalBrokerST,
    line5: k1ST,
    line8a_gain_loss: totalBrokerLT,
    line12: k1LT,
    line3_gain_loss: total6781ST,
    line10_gain_loss: total6781LT,
    line13_capital_gain_distributions: totalCapitalGainDistributions,
  })

  const combined = schD.schD_line16
  const appliedToReturn = schD.schD_line21 < 0 ? schD.schD_line21 : 0

  return {
    schD,
    netST: schD.schD_line7,
    netLT: schD.schD_line15,
    combined,
    appliedToReturn,
    carryforward: combined < 0 ? currency(combined).subtract(appliedToReturn).value : 0,
  }
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

  // ── broker_1099 / 1099-B totals ───────────────────────────────────────────
  // Reads the summary ST/LT figures from reviewed broker_1099 and 1099_b documents.
  // Our imported broker_1099 documents (stored via finance:tax-import or Tax Preview UI)
  // use field names like b_st_reported_gain_loss / b_lt_gain_loss.
  // AI-extracted 1099_b documents use total_realized_gain_loss with is_short_term per lot.
  type BrokerGainSource = { label: string; stGain: number; ltGain: number }
  const brokerSources: BrokerGainSource[] = []

  const brokerDocs = reviewed1099Docs.filter(
    (d) => d.form_type === 'broker_1099' || d.form_type === '1099_b' || d.form_type === '1099_b_c',
  )

  for (const doc of brokerDocs) {
    const p = (doc.parsed_data ?? {}) as Record<string, unknown>
    const payer = (p.payer_name as string | undefined) ?? doc.account?.acct_name ?? doc.original_filename ?? 'Brokerage'

    // Our manually-imported broker_1099 format (fields set by finance:tax-import / tinker)
    const stGain = readBrokerField(p, 'b_st_gain_loss', 'b_st_reported_gain_loss')
    const ltGain = readBrokerField(p, 'b_lt_gain_loss', 'b_lt_reported_gain_loss')
    const totalGain = readBrokerField(p, 'b_total_gain_loss', 'total_realized_gain_loss')

    if (stGain !== 0 || ltGain !== 0 || totalGain !== 0) {
      brokerSources.push({
        label: payer,
        stGain: stGain || (totalGain !== 0 ? totalGain : 0), // fallback if no ST/LT split
        ltGain,
      })
    }
  }

  const hasBrokerData = brokerSources.length > 0
  const totalBrokerST = brokerSources.reduce((acc, s) => acc.add(s.stGain), currency(0)).value
  const totalBrokerLT = brokerSources.reduce((acc, s) => acc.add(s.ltGain), currency(0)).value

  // ── Short-term capital gains/losses ──────────────────────────────────────
  type CapGainLine = { label: string; amount: number; note?: string; boxRef?: string }
  const stLines: CapGainLine[] = []

  for (const { doc, data } of k1Parsed) {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const box8 = pk1(data, '8')
    if (box8 !== 0) {
      stLines.push({ label: `${partnerName} — K-1 Box 8`, amount: box8, boxRef: '5' })
    }
  }

  // Form 6781 40% ST allocation
  if (total6781ST !== 0) {
    stLines.push({
      label: 'Form 6781 40% S/T allocation (Sec. 1256)',
      amount: total6781ST,
      note: '40% of Section 1256 gain/(loss) is always short-term',
      boxRef: '3',
    })
  }

  // broker_1099 / 1099-B short-term
  if (hasBrokerData) {
    for (const src of brokerSources) {
      if (src.stGain !== 0) {
        stLines.push({ label: `${src.label} — ST 1099-B`, amount: src.stGain, boxRef: '1a' })
      }
    }
  } else {
    stLines.push({
      label: 'Brokerage 1099-B (not yet uploaded)',
      amount: 0,
      note: 'Upload and review a 1099-B or broker_1099 document to include brokerage transactions',
      boxRef: '1a',
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

    if (box9a !== 0) ltLines.push({ label: `${partnerName} — K-1 Box 9a (L/T)`, amount: box9a, boxRef: '12' })
    if (box9b !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 9b (28% rate)`, amount: box9b, note: '28% collectibles rate', boxRef: '12' })
    if (box9c !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 9c (§1250 unrec.)`, amount: box9c, note: 'Unrecaptured §1250 gain', boxRef: '12' })
    if (box10 !== 0)
      ltLines.push({ label: `${partnerName} — K-1 Box 10 (§1231)`, amount: box10, note: '§1231 gain flows to Part II', boxRef: '12' })
  }

  // Form 6781 60% LT allocation
  if (total6781LT !== 0) {
    ltLines.push({
      label: 'Form 6781 60% L/T allocation (Sec. 1256)',
      amount: total6781LT,
      note: '60% of Section 1256 gain/(loss) is always long-term',
      boxRef: '10',
    })
  }

  // broker_1099 / 1099-B long-term
  if (hasBrokerData) {
    for (const src of brokerSources) {
      if (src.ltGain !== 0) {
        ltLines.push({ label: `${src.label} — LT 1099-B`, amount: src.ltGain, boxRef: '8a' })
      }
    }
  } else {
    ltLines.push({
      label: 'Brokerage 1099-B (not yet uploaded)',
      amount: 0,
      note: 'Upload and review a 1099-B or broker_1099 document to include brokerage transactions',
      boxRef: '8a',
    })
  }

  // ── Totals via lib/tax/scheduleD ─────────────────────────────────────────
  // Aggregate K-1 ST from Box 8 lines and LT from Box 9a/9b/9c/10 lines
  const k1ST = stLines
    .filter((l) => l.label.includes('K-1'))
    .reduce((acc, l) => acc.add(l.amount), currency(0)).value
  const k1LT = ltLines
    .filter((l) => l.label.includes('K-1'))
    .reduce((acc, l) => acc.add(l.amount), currency(0)).value

  const schD = scheduleD({
    line1a_gain_loss: totalBrokerST,   // ST brokerage (basis reported, Box A/1a)
    line5: k1ST,                        // ST from K-1 partnerships (Line 5)
    line8a_gain_loss: totalBrokerLT,   // LT brokerage (basis reported, Box D/8a)
    line12: k1LT,                       // LT from K-1 partnerships (Line 12)
    // Sec. 1256 split into the 6781 lines
    line3_gain_loss: total6781ST,       // Form 6781 ST 40% portion
    line10_gain_loss: total6781LT,      // Form 6781 LT 60% portion
  })

  const netST = schD.schD_line7
  const netLT = schD.schD_line15
  const combined = schD.schD_line16
  const appliedToReturn = schD.schD_line21 < 0 ? schD.schD_line21 : 0
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
      <div className="grid grid-cols-1 gap-4">
        <FormBlock title="Schedule D Part I — Short-Term">
          {stLines.map((line, i) => (
            <div key={i}>
              <FormLine {...(line.boxRef ? { boxRef: line.boxRef } : {})} label={line.label} value={line.amount} />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          {stLines.length === 0 && <FormLine label="No short-term items" raw="—" />}
          <FormTotalLine boxRef="7" label="Net Short-Term" value={netST} />
        </FormBlock>

        <FormBlock title="Schedule D Part II — Long-Term">
          {ltLines.map((line, i) => (
            <div key={i}>
              <FormLine {...(line.boxRef ? { boxRef: line.boxRef } : {})} label={line.label} value={line.amount} />
              {line.note && <FormSubLine text={line.note} />}
            </div>
          ))}
          {ltLines.length === 0 && <FormLine label="No long-term items" raw="—" />}
          <FormTotalLine boxRef="15" label="Net Long-Term" value={netLT} />
        </FormBlock>
      </div>

      {/* Summary */}
      <FormBlock title="Schedule D Summary">
        <FormLine boxRef="7" label="Net short-term capital gain (loss)" value={netST} />
        <FormLine boxRef="15" label="Net long-term capital gain (loss)" value={netLT} />
        <FormTotalLine boxRef="16" label="Combined net capital gain (loss)" value={combined} />
        {combined < 0 && (
          <>
            <FormLine
              boxRef="21"
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

      {!hasBrokerData && (
        <Callout kind="info" title="ℹ 1099-B Not Yet Uploaded">
          <p>
            No reviewed broker_1099 or 1099-B documents found. Upload and review brokerage 1099 documents in the
            Overview tab (All Tax Documents section) to include brokerage transactions in this analysis.
          </p>
        </Callout>
      )}
    </div>
  )
}
