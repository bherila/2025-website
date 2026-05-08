import {
  schedule2Line11AdditionalMedicareTaxFromFacts,
  scheduleDAggregatesForForm461FromFacts,
} from '@/lib/finance/taxPreviewFactsAdapters'
import type { ScheduleDFacts, TaxPreviewFacts } from '@/types/generated/tax-preview-facts'

describe('taxPreviewFactsAdapters', () => {
  it('combines wage and self-employment Additional Medicare Tax for Schedule 2 line 11', () => {
    const facts = {
      scheduleSE: { additionalMedicareTax: 12.34 },
      form8959: { additionalTax: 90.12 },
    } as unknown as TaxPreviewFacts

    expect(schedule2Line11AdditionalMedicareTaxFromFacts(facts)).toBe(102.46)
  })

  it('returns narrow zero Schedule D aggregates when facts are unavailable', () => {
    expect(scheduleDAggregatesForForm461FromFacts(undefined)).toEqual({
      schD_line21: 0,
      limitedPersonalCapGains: 0,
    })
  })

  it('maps only the Schedule D aggregate fields Form 461 consumes', () => {
    const facts = {
      line21LimitedLossOrGain: -3000,
      limitedPersonalCapGains: -2800,
      line11GainLoss: 999,
    } as unknown as ScheduleDFacts

    expect(scheduleDAggregatesForForm461FromFacts(facts)).toEqual({
      schD_line21: -3000,
      limitedPersonalCapGains: -2800,
    })
  })
})
