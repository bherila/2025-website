import type { CareerCompInputs } from '@/components/planning/CareerComp/types'
import type { IAward } from '@/types/finance'

import {
  firstPayslipHref,
  hasBrokerageLink,
  hasPayslipLink,
  needsRefundReconciliation,
  settlementLinkHref,
  transactionHref,
  virtualRefreshersFromCareerComp,
} from '../rsuUiHelpers'

const inputs: CareerCompInputs = {
  horizonYears: 4,
  startYear: 2026,
  modelAssumptions: {
    commonFmvPctOfPreferred: {
      stageA: 15,
      stageB: 25,
      stageC: 40,
      bridge: 50,
      stageD: 65,
      stageE: 80,
      liquidityEvent: 100,
    },
    tax: { filingStatus: 'single' },
    careerTransition: { currentJobNoticeWeeks: 2, timeOffBetweenJobsWeeks: 0 },
  },
  currentJobs: [
    {
      id: 'current',
      name: 'CurrentCo',
      notesMarkdown: null,
      archived: false,
      startDate: '2026-01-01',
      priorJobResignationDate: null,
      transitionOverride: { currentJobNoticeWeeks: null, timeOffBetweenJobsWeeks: null },
      retainedCurrentJobIds: [],
      company: {
        type: 'public',
        currentSharePrice: 100,
        fourNineA: 0,
        fullyDilutedShares: 0,
        annualDilutionPct: 0,
        liquidityDate: null,
        valuationScenarios: [],
      },
      comp: { baseSalary: 200000, cashBonus: 0, annualRaisePct: 5 },
      grantTypes: { rsu: true, options: false },
      refresher: {
        pctOfBase: 25,
        optionPctOfFullyDilutedShares: 0,
        optionType: 'iso',
        cadenceYears: 1,
        firstYearOffset: 1,
        vestingYears: 4,
        cliffMonths: 0,
        vestingFrequency: 'quarterly',
      },
      rsuGrants: [{ id: 'grant', kind: 'hire', grantDate: '2026-01-01', vestingStartDate: null, shareCount: 10, sourceAwardId: null, sourceAwardRowIds: [], symbol: 'ABC', rsuSource: null, grantValue: null, grantPrice: null, cliffMonths: 0, vestingYears: 4, vestingFrequency: 'quarterly', vestingSchedule: null, vestingEvents: [] }],
      optionGrants: [],
      growthBands: { lowPct: 0, mediumPct: 0, highPct: 0 },
    },
  ],
  hypotheticalJobs: [],
}

describe('rsuUiHelpers', () => {
  it('projects current-job RSU refreshers as virtual rows', () => {
    const rows = virtualRefreshersFromCareerComp(inputs)

    expect(rows).toHaveLength(48)
    expect(rows[0]).toMatchObject({
      award_id: 'Projected refresher 2027',
      vest_date: '2027-04-01',
      symbol: 'ABC',
      isVirtual: true,
      virtualKind: 'current_job_refresher',
      virtualValue: 52500,
    })
    expect(rows[0]?.share_count).toBe(32.8125)
  })

  it('anchors virtual current-job refreshers to jobs starting after the projection start year', () => {
    const rows = virtualRefreshersFromCareerComp({
      ...inputs,
      currentJobs: [{
        ...inputs.currentJobs[0]!,
        startDate: '2027-03-15',
      }],
    })

    expect(rows).toHaveLength(32)
    expect(rows[0]).toMatchObject({
      award_id: 'Projected refresher 2028',
      vest_date: '2028-04-01',
      virtualValue: 52500,
    })
    expect(rows[0]?.share_count).toBe(32.8125)
  })

  it('classifies brokerage and payslip links separately', () => {
    const award: IAward = {
      rsu_links: [
        { id: 1, link_type: 'share_deposit', transaction_id: 10, account_id: 5 },
        { id: 2, link_type: 'payslip_rsu_income', payslip_id: 8 },
      ],
    }

    expect(hasBrokerageLink(award)).toBe(true)
    expect(hasPayslipLink(award)).toBe(true)
    expect(transactionHref(award.rsu_links![0]!)).toBe('/finance/account/5/transactions#t_id=10')
  })

  it('uses canonical all-account transaction links and settlement-level brokerage links', () => {
    expect(transactionHref({ transaction_id: 10, account_id: null })).toBe('/finance/account/all/transactions#t_id=10')
    expect(hasBrokerageLink({
      settlement_allocations: [{ settlement: { id: 9, brokerage_account_id: 5, status: 'confirmed' } }],
      rsu_links: [],
    })).toBe(true)
  })

  it('recognizes settlement-level payslip links', () => {
    const award: IAward = {
      settlement_allocations: [{ settlement: { id: 9, payslip_id: 44, status: 'confirmed' } }],
      rsu_links: [],
    }

    expect(hasPayslipLink(award)).toBe(true)
    expect(firstPayslipHref(award)).toBe('/finance/payslips/entry?id=44')
  })

  it('does not count refund-only payslips as income payslip links', () => {
    const refundSettlement: IAward = {
      settlement_allocations: [{ settlement: { id: 9, refund_payslip_id: 44, status: 'confirmed' } }],
      rsu_links: [],
    }
    const refundLink: IAward = {
      settlement_allocations: [{ settlement: { id: 10, excess_refund: '42.00', status: 'confirmed' } }],
      rsu_links: [{ id: 1, link_type: 'payslip_rsu_excess_refund', payslip_id: 45 }],
    }

    expect(hasPayslipLink(refundSettlement)).toBe(false)
    expect(firstPayslipHref(refundSettlement)).toBeNull()
    expect(hasPayslipLink(refundLink)).toBe(false)
    expect(firstPayslipHref(refundLink)).toBeNull()
    expect(needsRefundReconciliation(refundSettlement)).toBe(false)
    expect(needsRefundReconciliation(refundLink)).toBe(false)
  })

  it('does not count type-only payslip links as linked payslips', () => {
    const award: IAward = {
      rsu_links: [{ id: 1, link_type: 'payslip_rsu_income', payslip_id: null }],
    }

    expect(hasPayslipLink(award)).toBe(false)
    expect(firstPayslipHref(award)).toBeNull()
  })

  it('flags settlements with an unreconciled excess refund', () => {
    const award: IAward = {
      settlement_allocations: [{ settlement: { id: 9, excess_refund: '42.00', status: 'confirmed' } }],
      rsu_links: [{ id: 1, link_type: 'payslip_rsu_income', payslip_id: 5 }],
    }

    expect(needsRefundReconciliation(award)).toBe(true)
    expect(needsRefundReconciliation({
      ...award,
      rsu_links: [{ id: 2, link_type: 'payslip_rsu_excess_refund', payslip_id: 6 }],
    })).toBe(false)
    expect(needsRefundReconciliation({
      ...award,
      rsu_links: [{ id: 3, link_type: 'payslip_rsu_excess_refund', payslip_id: null }],
    })).toBe(true)
  })

  it('can carry a default RSU link type in settlement link URLs', () => {
    expect(settlementLinkHref(9, 'payslip', 'payslip_rsu_excess_refund')).toBe('/finance/rsu?settlement_id=9&link=payslip&link_type=payslip_rsu_excess_refund')
  })
})
