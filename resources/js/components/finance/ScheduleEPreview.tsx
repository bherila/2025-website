'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import { getDocAmounts, getPayerName, hasNonZeroNumericValue } from '@/lib/finance/taxDocumentUtils'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'

// ── K-1 field helpers ─────────────────────────────────────────────────────────

function parseK1Field(data: FK1StructuredData, box: string): number {
  const v = data.fields[box]?.value
  if (!v) return 0
  const n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface PartnerRow {
  docId: number
  partnerName: string
  ein: string | null
  box1OrdinaryIncome: number
  box2NetRentalRealEstate: number
  box3OtherNetRental: number
  box4GuaranteedPayments: number
  box5Interest: number
  netPassive: number
  netNonpassive: number
}

interface MiscIncomeRow {
  key: string
  payerName: string
  formLabel: string
  amount: number
}

export interface ScheduleELines {
  miscIncomeRows: MiscIncomeRow[]
  miscIncomeTotal: number
  partnerRows: PartnerRow[]
  totalBox1: number
  totalBox2: number
  totalBox3: number
  totalBox4: number
  totalBox5: number
  totalPassive: number
  totalNonpassive: number
  grandTotal: number
}

function hasRentalRoyaltyFields(doc: TaxDocument): boolean {
  if (!doc.parsed_data || Array.isArray(doc.parsed_data)) {
    return false
  }

  const parsedData = doc.parsed_data as Record<string, unknown>
  return hasNonZeroNumericValue(parsedData, 'box1_rents', 'box2_royalties')
}

export function computeScheduleELines(reviewedK1Docs: TaxDocument[], reviewed1099Docs: TaxDocument[] = []): ScheduleELines {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const miscIncomeRows = reviewed1099Docs.flatMap((doc) => {
    const links = doc.account_links ?? []

    if (links.length > 0) {
      return links.flatMap((link) => {
        if (link.form_type !== '1099_misc') {
          return []
        }

        const amount = getDocAmounts(doc, link).other
        const effectiveRouting = link.misc_routing ?? doc.misc_routing
        const shouldInclude = amount !== null
          && (effectiveRouting === 'sch_e' || (effectiveRouting == null && hasRentalRoyaltyFields(doc)))

        if (!shouldInclude) {
          return []
        }

        const payerName = getPayerName(doc, link) ?? link.account?.acct_name ?? doc.original_filename ?? '1099-MISC'
        return [{
          key: `link-${link.id}`,
          payerName,
          formLabel: FORM_TYPE_LABELS[link.form_type] ?? link.form_type,
          amount,
        }]
      })
    }

    if (doc.form_type !== '1099_misc') {
      return []
    }

    const amount = getDocAmounts(doc).other
    const shouldInclude = amount !== null
      && (doc.misc_routing === 'sch_e' || (doc.misc_routing == null && hasRentalRoyaltyFields(doc)))

    if (!shouldInclude) {
      return []
    }

    const payerName = getPayerName(doc) ?? doc.account?.acct_name ?? doc.original_filename ?? '1099-MISC'
    return [{
      key: `doc-${doc.id}`,
      payerName,
      formLabel: FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type,
      amount,
    }]
  })

  const partnerRows: PartnerRow[] = k1Parsed.map(({ doc, data }) => {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const ein = data.fields['A']?.value ?? null

    const box1OrdinaryIncome = parseK1Field(data, '1')
    const box2NetRentalRealEstate = parseK1Field(data, '2')
    const box3OtherNetRental = parseK1Field(data, '3')
    const box4GuaranteedPayments = parseK1Field(data, '4')
    const box5Interest = parseK1Field(data, '5')

    const netPassive = currency(box2NetRentalRealEstate).add(box3OtherNetRental).value
    const netNonpassive = currency(box1OrdinaryIncome).add(box4GuaranteedPayments).value

    return {
      docId: doc.id,
      partnerName,
      ein,
      box1OrdinaryIncome,
      box2NetRentalRealEstate,
      box3OtherNetRental,
      box4GuaranteedPayments,
      box5Interest,
      netPassive,
      netNonpassive,
    }
  })

  const totalBox1 = partnerRows.reduce((acc, r) => acc.add(r.box1OrdinaryIncome), currency(0)).value
  const totalBox2 = partnerRows.reduce((acc, r) => acc.add(r.box2NetRentalRealEstate), currency(0)).value
  const totalBox3 = partnerRows.reduce((acc, r) => acc.add(r.box3OtherNetRental), currency(0)).value
  const totalBox4 = partnerRows.reduce((acc, r) => acc.add(r.box4GuaranteedPayments), currency(0)).value
  const totalBox5 = partnerRows.reduce((acc, r) => acc.add(r.box5Interest), currency(0)).value
  const miscIncomeTotal = miscIncomeRows.reduce((acc, row) => acc.add(row.amount), currency(0)).value
  const totalPassive = partnerRows.reduce((acc, r) => acc.add(r.netPassive), currency(0)).value
  const totalNonpassive = partnerRows.reduce((acc, r) => acc.add(r.netNonpassive), currency(0)).value
  const grandTotal = currency(miscIncomeTotal).add(totalPassive).add(totalNonpassive).value

  return {
    miscIncomeRows,
    miscIncomeTotal,
    partnerRows,
    totalBox1,
    totalBox2,
    totalBox3,
    totalBox4,
    totalBox5,
    totalPassive,
    totalNonpassive,
    grandTotal,
  }
}

interface ScheduleEPreviewProps {
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs?: TaxDocument[]
  selectedYear: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScheduleEPreview({ reviewedK1Docs, reviewed1099Docs = [], selectedYear }: ScheduleEPreviewProps) {
  const {
    miscIncomeRows,
    miscIncomeTotal,
    partnerRows,
    totalBox1,
    totalBox2,
    totalBox3,
    totalBox4,
    totalBox5,
    totalPassive,
    totalNonpassive,
    grandTotal,
  } = computeScheduleELines(reviewedK1Docs, reviewed1099Docs)

  if (partnerRows.length === 0 && miscIncomeRows.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold mb-0.5">Schedule E — {selectedYear}</h3>
          <p className="text-xs text-muted-foreground">Supplemental Income and Loss</p>
        </div>
        <p className="text-sm text-muted-foreground">No Schedule E tax documents reviewed for this year.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold mb-0.5">Schedule E — {selectedYear}</h3>
        <p className="text-xs text-muted-foreground">
          Supplemental Income and Loss — Partnerships &amp; S Corporations (Part II)
        </p>
      </div>

      {miscIncomeRows.length > 0 && (
        <FormBlock title="Part I — 1099-MISC Rental & Royalty Income">
          {miscIncomeRows.map((row) => (
            <FormLine key={row.key} label={`${row.payerName} — ${row.formLabel}`} value={row.amount} />
          ))}
          <FormTotalLine label="1099-MISC rental & royalty income subtotal" value={miscIncomeTotal} />
        </FormBlock>
      )}

      {/* Part I — Rental Real Estate (if any Box 2 activity) */}
      {totalBox2 !== 0 && (
        <FormBlock title="Part I — Rental Real Estate Income / (Loss)">
          {partnerRows
            .filter((r) => r.box2NetRentalRealEstate !== 0)
            .map((r) => (
              <FormLine
                key={r.docId}
                label={`${r.partnerName} — K-1 Box 2 net rental real estate`}
                value={r.box2NetRentalRealEstate}
              />
            ))}
          <FormTotalLine label="Part I total net rental real estate income / (loss)" value={totalBox2} />
        </FormBlock>
      )}

      {/* Part II — Partnerships & S Corporations */}
      <FormBlock title="Part II — Partnership / S-Corp Income / (Loss)">
        {partnerRows.map((r) => (
          <div key={r.docId}>
            {r.box1OrdinaryIncome !== 0 && (
              <FormLine
                label={`${r.partnerName}${r.ein ? ` (EIN ${r.ein})` : ''} — Box 1 ordinary income`}
                value={r.box1OrdinaryIncome}
              />
            )}
            {r.box3OtherNetRental !== 0 && (
              <FormLine
                label={`${r.partnerName} — Box 3 other net rental income`}
                value={r.box3OtherNetRental}
              />
            )}
            {r.box4GuaranteedPayments !== 0 && (
              <FormLine
                label={`${r.partnerName} — Box 4 guaranteed payments`}
                value={r.box4GuaranteedPayments}
              />
            )}
            {r.box5Interest !== 0 && (
              <FormLine
                label={`${r.partnerName} — Box 5 interest income (see Sch B)`}
                value={r.box5Interest}
              />
            )}
          </div>
        ))}
        <FormTotalLine label="Total nonpassive income / (loss) — Part II" value={totalNonpassive} />
      </FormBlock>

      {/* Summary grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormBlock title="Passive Income / (Loss)">
          {totalBox2 !== 0 && <FormLine label="Rental real estate (Box 2)" value={totalBox2} />}
          {totalBox3 !== 0 && <FormLine label="Other net rental income (Box 3)" value={totalBox3} />}
          {totalPassive === 0 && totalBox2 === 0 && totalBox3 === 0 && (
            <FormLine label="No passive K-1 activity" raw="—" />
          )}
          <FormTotalLine label="Total passive income / (loss)" value={totalPassive} />
        </FormBlock>

        <FormBlock title="Nonpassive Income / (Loss)">
          {totalBox1 !== 0 && <FormLine label="Ordinary business income (Box 1)" value={totalBox1} />}
          {totalBox4 !== 0 && <FormLine label="Guaranteed payments (Box 4)" value={totalBox4} />}
          {totalBox5 !== 0 && (
            <FormLine
              label="Interest income (Box 5)"
              value={totalBox5}
            />
          )}
          {totalNonpassive === 0 && totalBox1 === 0 && totalBox4 === 0 && (
            <FormLine label="No nonpassive K-1 activity" raw="—" />
          )}
          <FormTotalLine label="Total nonpassive income / (loss)" value={totalNonpassive} />
        </FormBlock>
      </div>

      <FormBlock title="Schedule E — Combined Net Income / (Loss)">
        {miscIncomeTotal !== 0 && <FormLine label="1099-MISC rental & royalty income" value={miscIncomeTotal} />}
        <FormLine label="Passive (rental / other rental)" value={totalPassive} />
        <FormLine label="Nonpassive (ordinary + guaranteed payments)" value={totalNonpassive} />
        <FormTotalLine label="Schedule E combined total" value={grandTotal} double />
      </FormBlock>
    </div>
  )
}
