'use client'

import currency from 'currency.js'

import { FactsLoadingPlaceholder, FormBlock, FormLine, FormTotalLine, InfoTooltip, OpenAllK1Button } from '@/components/finance/tax-preview-primitives'
import type { ScheduleEFacts, TaxFactSource } from '@/types/generated/tax-preview-facts'

interface ScheduleEPreviewProps {
  taxFacts?: ScheduleEFacts | null
  selectedYear: number
  onOpenDoc?: (docId: number) => void
  onOpenAllK1?: () => void
}

function sourceDetailProps(source: TaxFactSource, onOpenDoc?: (docId: number) => void) {
  if (source.taxDocumentId === null || !onOpenDoc) {
    return {}
  }

  const formLabel = source.formType?.replaceAll('_', '-').toUpperCase() ?? 'source'

  return {
    onDetails: () => onOpenDoc(source.taxDocumentId!),
    detailsTooltip: `Open ${formLabel} detail`,
  }
}

function SourceLines({
  sources,
  onOpenDoc,
}: {
  sources: TaxFactSource[]
  onOpenDoc?: (docId: number) => void
}) {
  return (
    <>
      {sources.map((source) => (
        <div key={source.id}>
          <FormLine
            label={source.label}
            value={source.amount}
            isReviewed={source.isReviewed === false ? false : undefined}
            {...sourceDetailProps(source, onOpenDoc)}
          />
          {source.notes && <FormLine label="Note" raw={source.notes} note />}
        </div>
      ))}
    </>
  )
}

export default function ScheduleEPreview({ taxFacts, selectedYear, onOpenDoc, onOpenAllK1 }: ScheduleEPreviewProps) {
  if (!taxFacts) {
    return <FactsLoadingPlaceholder label="Schedule E" />
  }

  const hasFacts = taxFacts.miscIncomeSources.length > 0
    || taxFacts.box1Sources.length > 0
    || taxFacts.box2Sources.length > 0
    || taxFacts.box3Sources.length > 0
    || taxFacts.box4Sources.length > 0
    || taxFacts.box11ZZSources.length > 0
    || taxFacts.box13ZZSources.length > 0
    || taxFacts.form4952InvestmentInterestSources.length > 0
    || taxFacts.materialParticipationTraderInterestSources.length > 0
    || taxFacts.grandTotal !== 0

  if (!hasFacts) {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold mb-0.5">Schedule E — {selectedYear}</h3>
          <p className="text-xs text-muted-foreground">Supplemental Income and Loss</p>
        </div>
        <p className="text-sm text-muted-foreground">No Schedule E tax facts found for this year.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold mb-0.5">Schedule E — {selectedYear}</h3>
          <p className="text-xs text-muted-foreground">
            Supplemental Income and Loss — Partnerships &amp; S Corporations (Part II)
          </p>
        </div>
        {onOpenAllK1 && <OpenAllK1Button onClick={onOpenAllK1} />}
      </div>

      {taxFacts.miscIncomeSources.length > 0 && (
        <FormBlock title="Part I — 1099-MISC Rental & Royalty Income">
          <SourceLines sources={taxFacts.miscIncomeSources} {...(onOpenDoc ? { onOpenDoc } : {})} />
          <FormTotalLine label="1099-MISC rental & royalty income subtotal" value={taxFacts.miscIncomeTotal} />
        </FormBlock>
      )}

      {taxFacts.totalBox2 !== 0 && (
        <FormBlock title="Part I — Rental Real Estate Income / (Loss)">
          <SourceLines sources={taxFacts.box2Sources} {...(onOpenDoc ? { onOpenDoc } : {})} />
          <FormTotalLine label="Part I total net rental real estate income / (loss)" value={taxFacts.totalBox2} />
        </FormBlock>
      )}

      <FormBlock title="Part II — Partnership / S-Corp Income / (Loss)">
        <SourceLines sources={taxFacts.box1Sources} {...(onOpenDoc ? { onOpenDoc } : {})} />
        <SourceLines sources={taxFacts.box3Sources} {...(onOpenDoc ? { onOpenDoc } : {})} />
        <SourceLines sources={taxFacts.box4Sources} {...(onOpenDoc ? { onOpenDoc } : {})} />
        {taxFacts.totalBox5 !== 0 && (
          <FormLine
            label="Interest income (Box 5, see Sch B)"
            value={taxFacts.totalBox5}
          />
        )}
        {taxFacts.box11ZZSources.map((source) => (
          <div key={source.id}>
            <FormLine
              label={(
                <span className="inline-flex items-center gap-1">
                  {source.label}
                  <InfoTooltip>
                    Trader-fund statement items such as Section 988 FX, swaps, and PFIC mark-to-market are ordinary
                    income or loss on Schedule E Part II, not Schedule D capital gain or loss.
                  </InfoTooltip>
                </span>
              )}
              value={source.amount}
              isReviewed={source.isReviewed === false ? false : undefined}
              {...sourceDetailProps(source, onOpenDoc)}
            />
            {source.notes && <FormLine label="Note" raw={source.notes} note />}
          </div>
        ))}
        {taxFacts.box13ZZSources.map((source) => (
          <div key={source.id}>
            <FormLine
              label={(
                <span className="inline-flex items-center gap-1">
                  {source.label}
                  <InfoTooltip>
                    Trader-fund management, admin, and similar statement deductions reduce Schedule E Part II
                    nonpassive income in this preview.
                  </InfoTooltip>
                </span>
              )}
              value={source.amount}
              isReviewed={source.isReviewed === false ? false : undefined}
              {...sourceDetailProps(source, onOpenDoc)}
            />
            {source.notes && <FormLine label="Note" raw={source.notes} note />}
          </div>
        ))}
        {taxFacts.form4952InvestmentInterestSources.map((source) => (
          <FormLine
            key={source.id}
            label={(
              <span className="inline-flex items-center gap-1">
                {source.label}
                <InfoTooltip>
                  Non-materially-participating securities-trading partnership interest remains subject to
                  Form 4952, but the allowed portion is deducted above the line on Schedule E Part II.
                </InfoTooltip>
              </span>
            )}
            value={source.amount}
          />
        ))}
        {taxFacts.materialParticipationTraderInterestSources.map((source) => (
          <div key={source.id}>
            <FormLine
              label={(
                <span className="inline-flex items-center gap-1">
                  {source.label}
                  <InfoTooltip>
                    Material participation treats the securities-trading interest as trade-or-business
                    interest outside Form 4952; Pub. 550 and §62(a)(1) support the full above-the-line
                    Schedule E deduction.
                  </InfoTooltip>
                </span>
              )}
              value={source.amount}
              isReviewed={source.isReviewed === false ? false : undefined}
              {...sourceDetailProps(source, onOpenDoc)}
            />
            {source.notes && <FormLine label="Note" raw={source.notes} note />}
          </div>
        ))}
        {taxFacts.totalNonpassive === 0
          && taxFacts.box1Sources.length === 0
          && taxFacts.box3Sources.length === 0
          && taxFacts.box4Sources.length === 0
          && taxFacts.box11ZZSources.length === 0
          && taxFacts.box13ZZSources.length === 0
          && taxFacts.form4952InvestmentInterestSources.length === 0
          && taxFacts.materialParticipationTraderInterestSources.length === 0 && (
          <FormLine label="No nonpassive K-1 activity" raw="—" />
        )}
        <FormTotalLine label="Total nonpassive income / (loss) — Part II" value={taxFacts.totalNonpassive} />
      </FormBlock>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <FormBlock title="Passive Income / (Loss)">
          {taxFacts.totalBox2 !== 0 && <FormLine label="Rental real estate (Box 2)" value={taxFacts.totalBox2} />}
          {taxFacts.totalBox3 !== 0 && <FormLine label="Other net rental income (Box 3)" value={taxFacts.totalBox3} />}
          {taxFacts.totalPassive === 0 && taxFacts.totalBox2 === 0 && taxFacts.totalBox3 === 0 && (
            <FormLine label="No passive K-1 activity" raw="—" />
          )}
          <FormTotalLine label="Total passive income / (loss)" value={taxFacts.totalPassive} />
        </FormBlock>

        <FormBlock title="Nonpassive Income / (Loss)">
          {taxFacts.totalBox1 !== 0 && <FormLine label="Ordinary business income (Box 1)" value={taxFacts.totalBox1} />}
          {taxFacts.totalBox4 !== 0 && <FormLine label="Guaranteed payments (Box 4)" value={taxFacts.totalBox4} />}
          {taxFacts.totalBox5 !== 0 && (
            <FormLine
              label="Interest income (Box 5)"
              value={taxFacts.totalBox5}
            />
          )}
          {taxFacts.totalBox11ZZ !== 0 && (
            <FormLine label="Other ordinary income / (loss) (Box 11ZZ)" value={taxFacts.totalBox11ZZ} />
          )}
          {taxFacts.totalBox13ZZ !== 0 && (
            <FormLine label="Other deductions (Box 13ZZ)" value={currency(0).subtract(taxFacts.totalBox13ZZ).value} />
          )}
          {taxFacts.totalForm4952InvestmentInterest !== 0 && (
            <FormLine label="Investment interest allowed by Form 4952 on Schedule E" value={currency(0).subtract(taxFacts.totalForm4952InvestmentInterest).value} />
          )}
          {taxFacts.totalMaterialParticipationTraderInterest !== 0 && (
            <FormLine label="Material-participation trader interest" value={currency(0).subtract(taxFacts.totalMaterialParticipationTraderInterest).value} />
          )}
          {taxFacts.totalNonpassive === 0 && taxFacts.totalBox1 === 0 && taxFacts.totalBox4 === 0 && taxFacts.totalBox11ZZ === 0 && taxFacts.totalBox13ZZ === 0 && taxFacts.totalForm4952InvestmentInterest === 0 && taxFacts.totalMaterialParticipationTraderInterest === 0 && (
            <FormLine label="No nonpassive K-1 activity" raw="—" />
          )}
          <FormTotalLine label="Total nonpassive income / (loss)" value={taxFacts.totalNonpassive} />
        </FormBlock>
      </div>

      <FormBlock title="Schedule E — Combined Net Income / (Loss)">
        {taxFacts.miscIncomeTotal !== 0 && <FormLine label="1099-MISC rental & royalty income" value={taxFacts.miscIncomeTotal} />}
        <FormLine label="Passive (rental / other rental)" value={taxFacts.totalPassive} />
        <FormLine label="Nonpassive (ordinary + guaranteed payments + trader fund statement items)" value={taxFacts.totalNonpassive} />
        <FormTotalLine label="Schedule E combined total" value={taxFacts.grandTotal} double />
      </FormBlock>
    </div>
  )
}
