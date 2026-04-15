'use client'

import currency from 'currency.js'

import { isFK1StructuredData } from '@/components/finance/k1'
import { FormBlock, FormLine, FormTotalLine } from '@/components/finance/tax-preview-primitives'
import type { FK1StructuredData } from '@/types/finance/k1-data'
import type { TaxDocument } from '@/types/finance/tax-document'

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

interface ScheduleEPreviewProps {
  reviewedK1Docs: TaxDocument[]
  selectedYear: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScheduleEPreview({ reviewedK1Docs, selectedYear }: ScheduleEPreviewProps) {
  const k1Parsed = reviewedK1Docs
    .map((d) => ({ doc: d, data: isFK1StructuredData(d.parsed_data) ? d.parsed_data : null }))
    .filter((x): x is { doc: TaxDocument; data: FK1StructuredData } => x.data !== null)

  const partnerRows: PartnerRow[] = k1Parsed.map(({ doc, data }) => {
    const partnerName =
      data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership'
    const ein = data.fields['A']?.value ?? null

    const box1OrdinaryIncome = parseK1Field(data, '1')
    const box2NetRentalRealEstate = parseK1Field(data, '2')
    const box3OtherNetRental = parseK1Field(data, '3')
    const box4GuaranteedPayments = parseK1Field(data, '4')
    const box5Interest = parseK1Field(data, '5')

    // For Schedule E purposes, Box 1 ordinary income is typically nonpassive for
    // active/trader partnerships; Box 2/3 rental are passive by default.
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

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalBox1 = partnerRows.reduce((acc, r) => acc.add(r.box1OrdinaryIncome), currency(0)).value
  const totalBox2 = partnerRows.reduce((acc, r) => acc.add(r.box2NetRentalRealEstate), currency(0)).value
  const totalBox3 = partnerRows.reduce((acc, r) => acc.add(r.box3OtherNetRental), currency(0)).value
  const totalBox4 = partnerRows.reduce((acc, r) => acc.add(r.box4GuaranteedPayments), currency(0)).value
  const totalBox5 = partnerRows.reduce((acc, r) => acc.add(r.box5Interest), currency(0)).value
  const totalPassive = partnerRows.reduce((acc, r) => acc.add(r.netPassive), currency(0)).value
  const totalNonpassive = partnerRows.reduce((acc, r) => acc.add(r.netNonpassive), currency(0)).value
  const grandTotal = currency(totalPassive).add(totalNonpassive).value

  if (partnerRows.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold mb-0.5">Schedule E — {selectedYear}</h3>
          <p className="text-xs text-muted-foreground">Supplemental Income and Loss</p>
        </div>
        <p className="text-sm text-muted-foreground">No K-1 documents reviewed for this year.</p>
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
        <FormLine label="Passive (rental / other rental)" value={totalPassive} />
        <FormLine label="Nonpassive (ordinary + guaranteed payments)" value={totalNonpassive} />
        <FormTotalLine label="Schedule E combined total" value={grandTotal} double />
      </FormBlock>
    </div>
  )
}
