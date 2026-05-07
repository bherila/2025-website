import currency from 'currency.js'

import type { ScheduleDData } from '@/lib/tax/scheduleD'
import type {
  CapitalLossCarryoverLines,
  Form461Lines,
  Form1116Lines,
  Form4797Lines,
  Form4952Lines,
  Form6251Lines,
  Form8582Lines,
  Form8606Lines,
  Form8959Lines,
  Form8960Lines,
  Form8995Lines,
  Schedule1Lines,
  Schedule2Lines,
  ScheduleALines,
  ScheduleBLines,
  ScheduleCNetIncome,
  ScheduleELines,
  ScheduleFLines,
  ScheduleSEEntrySourceType,
  ScheduleSELines,
  TaxReturn1040,
} from '@/types/finance/tax-return'
import type {
  Form1116Facts,
  Form4952Facts,
  Form6251Facts,
  Form8582Facts,
  Form8606Facts,
  Form8960Facts,
  Form8995Facts,
  Schedule1Facts,
  Schedule3Facts,
  ScheduleAFacts,
  ScheduleBFacts,
  ScheduleCFacts,
  ScheduleDFacts,
  ScheduleEFacts,
  ScheduleFFacts,
  ScheduleSEFacts,
  TaxFactSource,
  TaxPreviewFacts,
} from '@/types/generated/tax-preview-facts'

interface TaxReturnFactsOptions extends Pick<TaxReturn1040, 'overviewSections' | 'k1Docs' | 'k3Docs' | 'docs1099' | 'shortDividends' | 'estimatedTaxPayments'> {
  isMarried: boolean
  form8959: Form8959Lines
  form461: Form461Lines
  capitalLossCarryover: CapitalLossCarryoverLines
}

export function sourceLines(sources: TaxFactSource[]): { label: string; amount: number; docId?: number }[] {
  return sources.map((source) => ({
    label: source.label,
    amount: source.amount,
    ...(source.taxDocumentId !== null ? { docId: source.taxDocumentId } : {}),
  }))
}

export function scheduleCNetIncomeFromFacts(facts: ScheduleCFacts | undefined): ScheduleCNetIncome {
  if (!facts) {
    return { total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }
  }

  return {
    total: facts.netProfit,
    byQuarter: facts.netProfitCumulativeByQuarter,
  }
}

export function schedule1FactsToLines(facts: Schedule1Facts): Schedule1Lines {
  return {
    partI: {
      line1a_taxableRefunds: null,
      line2a_alimonyReceived: null,
      line3_business: facts.line3Total,
      line4_otherGains: facts.line4Total === 0 ? null : facts.line4Total,
      line5_rentalPartnerships: facts.line5Total,
      line6_farmIncome: facts.line6Total === 0 ? null : facts.line6Total,
      line7_unemploymentCompensation: null,
      line8b_gambling: facts.line8bTotal === 0 ? null : facts.line8bTotal,
      line8h_juryDuty: facts.line8hTotal === 0 ? null : facts.line8hTotal,
      line8i_prizes: facts.line8iTotal === 0 ? null : facts.line8iTotal,
      line8z_otherIncome: facts.line8zTotal,
      line9_totalOther: facts.line9TotalOtherIncome,
      line10_total: currency(facts.line3Total)
        .add(facts.line4Total)
        .add(facts.line5Total)
        .add(facts.line6Total)
        .add(facts.line9TotalOtherIncome).value,
    },
    partII: {
      line13_hsaDeduction: null,
      line15_deductibleSeTax: facts.line15Total === 0 ? null : facts.line15Total,
      line17_selfEmployedHealthInsurance: null,
      line20_iraDeduction: null,
      line21_studentLoanInterest: null,
      line26_totalAdjustments: facts.line15Total,
    },
  }
}

export function schedule3FactsToLines(facts: Schedule3Facts) {
  return {
    partI: {
      line1_foreignTaxCredit: facts.line1ForeignTaxCredit,
      line2_dependentCareCredit: facts.line2ChildDependentCareCredit,
      line3_educationCredits: facts.line3EducationCredits,
      line4_retirementSavingsCredit: facts.line4RetirementSavingsCredit,
      line5a_residentialCleanEnergy: facts.line5aResidentialCleanEnergyCredit,
      line5b_energyEfficientHome: facts.line5bEnergyEfficientHomeImprovementCredit,
      line7_otherCredits: facts.line7OtherNonrefundableCredits,
      line8_total: facts.line8TotalNonrefundableCredits,
    },
    partII: {
      line9_netPremiumTaxCredit: facts.line9NetPremiumTaxCredit,
      line10_extensionPayment: facts.line10ExtensionPayment,
      line11_excessSSWithheld: facts.line11ExcessSocialSecurityWithheld,
      line12_fuelTaxCredit: facts.line12FuelTaxCredit,
      line14_otherPayments: facts.line14OtherPaymentsRefundableCredits,
      line15_total: facts.line15TotalPaymentsRefundableCredits,
    },
  }
}

export function scheduleAFactsToLines(facts: ScheduleAFacts, isMarried: boolean): ScheduleALines {
  return {
    invIntSources: sourceLines(facts.investmentInterestSources),
    totalInvIntExpense: facts.investmentInterestTotal,
    saltPaid: facts.saltPaidBeforeCap,
    saltDeduction: facts.saltDeduction,
    mortgageInterest: facts.mortgageInterestTotal,
    charitable: facts.charitableTotal,
    otherDeductions: facts.otherItemizedTotal,
    otherItemizedSources: sourceLines(facts.otherItemizedSources),
    totalOtherItemized: facts.otherItemizedTotal,
    userDeductions: [],
    totalItemizedDeductions: facts.totalItemizedDeductions,
    standardDeduction: isMarried ? facts.standardDeductionMarriedFilingJointly : facts.standardDeductionSingle,
    shouldItemize: isMarried ? facts.shouldItemizeMarriedFilingJointly : facts.shouldItemizeSingle,
  }
}

export function scheduleBFactsToLines(facts: ScheduleBFacts): ScheduleBLines {
  return {
    interestTotal: facts.interestTotal,
    dividendTotal: facts.ordinaryDividendTotal,
    qualifiedDivTotal: facts.qualifiedDividendTotal,
    interestLines: sourceLines(facts.interestSources),
    dividendLines: sourceLines(facts.ordinaryDividendSources),
    qualifiedDividendLines: sourceLines(facts.qualifiedDividendSources),
  }
}

export function scheduleDDataFromFacts(facts: ScheduleDFacts): ScheduleDData {
  return {
    schD_line1a_proceeds: 0,
    schD_line1a_cost: 0,
    schD_line1a_adjustments: 0,
    schD_line1a_gain_loss: facts.line1aGainLoss,
    schD_line1b_proceeds: 0,
    schD_line1b_cost: 0,
    schD_line1b_adjustments: 0,
    schD_line1b_gain_loss: facts.line1bGainLoss,
    schD_line2_proceeds: 0,
    schD_line2_cost: 0,
    schD_line2_adjustments: 0,
    schD_line2_gain_loss: facts.line2GainLoss,
    schD_line3_proceeds: 0,
    schD_line3_cost: 0,
    schD_line3_adjustments: 0,
    schD_line3_gain_loss: facts.line3GainLoss,
    schD_line4: facts.line4GainLoss,
    schD_line5: facts.line5GainLoss,
    schD_line6: facts.line6Carryover,
    schD_line7: facts.line7NetShortTerm,
    schD_line8a_proceeds: 0,
    schD_line8a_cost: 0,
    schD_line8a_adjustments: 0,
    schD_line8a_gain_loss: facts.line8aGainLoss,
    schD_line8b_proceeds: 0,
    schD_line8b_cost: 0,
    schD_line8b_adjustments: 0,
    schD_line8b_gain_loss: facts.line8bGainLoss,
    schD_line9_proceeds: 0,
    schD_line9_cost: 0,
    schD_line9_adjustments: 0,
    schD_line9_gain_loss: facts.line9GainLoss,
    schD_line10_proceeds: 0,
    schD_line10_cost: 0,
    schD_line10_adjustments: 0,
    schD_line10_gain_loss: facts.line10GainLoss,
    schD_line11: facts.line11GainLoss,
    schD_line12: facts.line12GainLoss,
    schD_line13: facts.line13CapitalGainDistributions,
    schD_line14: facts.line14Carryover,
    schD_line15: facts.line15NetLongTerm,
    schD_line16: facts.line16Combined,
    schD_line21: facts.line21LimitedLossOrGain,
    totalBusinessCapGains: facts.totalBusinessCapGains,
    totalPersonalCapGains: facts.totalPersonalCapGains,
    limitedBusinessCapGains: facts.limitedBusinessCapGains,
    limitedPersonalCapGains: facts.limitedPersonalCapGains,
  }
}

export function scheduleEFactsToLines(facts: ScheduleEFacts): ScheduleELines {
  return {
    grandTotal: facts.grandTotal,
    totalPassive: facts.totalPassive,
    totalNonpassive: facts.totalNonpassive,
    totalTraderNii: facts.totalTraderNii,
  }
}

export function scheduleSEFactsToLines(facts: ScheduleSEFacts): ScheduleSELines {
  return {
    ...facts,
    entries: facts.entries.map(entry => ({
      label: entry.label,
      amount: entry.amount,
      sourceType: entry.sourceType as ScheduleSEEntrySourceType,
    })),
  }
}

export function form4952FactsToLines(facts: Form4952Facts): Form4952Lines {
  return {
    invIntSources: sourceLines(facts.investmentInterestSources),
    totalInvIntExpense: facts.totalInvestmentInterestExpense,
    scheduleEDeductibleInvestmentInterestExpense: facts.deductibleInvestmentInterestExpense,
    invExpSources: sourceLines(facts.investmentExpenseSources),
    totalInvExp: facts.totalInvestmentExpenses,
    niiBefore: facts.netInvestmentIncomeBeforeQualifiedDividendElection,
    totalQualDiv: facts.totalQualifiedDividends,
    deductibleInvestmentInterestExpense: facts.deductibleInvestmentInterestExpense,
    disallowedCarryforward: facts.disallowedCarryforward,
  }
}

export function form1116FactsToLines(facts: Form1116Facts): Form1116Lines {
  return {
    incomeSources: sourceLines(facts.passiveIncomeSources),
    taxSources: sourceLines(facts.foreignTaxSources),
    totalPassiveIncome: facts.totalPassiveIncome,
    totalForeignTaxes: facts.totalForeignTaxes,
    generalIncomeSources: sourceLines(facts.generalIncomeSources),
    totalGeneralIncome: facts.totalGeneralIncome,
    line4bApportionment: sourceLines(facts.line4bSources).map(source => ({
      label: source.label,
      interestExpense: source.amount,
      ratio: 0,
      line4b: source.amount,
    })),
    totalLine4b: facts.totalLine4b,
    creditVsDeduction: facts.recommendation === 'credit'
      ? {
          creditValue: facts.creditValue,
          deductionValue: facts.deductionValueAtThirtySevenPercent,
          recommendation: 'credit',
        }
      : null,
    turboTaxAlert: facts.turboTaxAlert,
    totalK1Box5: facts.totalK1Box5,
  }
}

export function form6251FactsToLines(facts: Form6251Facts): Form6251Lines {
  return {
    ...facts,
    line2aSource: facts.line2aSource === 'salt_deduction' || facts.line2aSource === 'standard_deduction'
      ? facts.line2aSource
      : 'none',
    filingStatus: facts.filingStatus === 'mfj' ? 'mfj' : 'single',
    sourceEntries: facts.sourceEntries.map(entry => ({
      ...entry,
      requiresStatementReview: entry.requiresStatementReview,
    })),
  }
}

export function form8582FactsToLines(facts: Form8582Facts): Form8582Lines {
  return {
    ...facts,
    activities: facts.activities.map(activity => ({
      ...activity,
      ein: activity.ein ?? undefined,
    })),
  }
}

export function form8606FactsToLines(facts: Form8606Facts): Form8606Lines {
  return facts
}

export function form4797FactsToLines(facts: TaxPreviewFacts['form4797']): Form4797Lines {
  return {
    partINet1231: facts.partINet1231,
    partIIOrdinary: facts.partIIOrdinary,
    partIIIRecapture: facts.partIIIRecapture,
    netToSchedule1Line4: facts.netToSchedule1Line4,
    netToScheduleDLongTerm: facts.netToScheduleDLongTerm,
    hasActivity: facts.hasActivity,
  }
}

export function scheduleFFactsToLines(facts: ScheduleFFacts): ScheduleFLines {
  return {
    grossFarmIncome: facts.grossFarmIncome,
    totalExpenses: facts.totalFarmExpenses,
    netProfitOrLoss: facts.netFarmProfit,
    hasActivity: facts.hasActivity,
  }
}

export function form8960FactsToLines(facts: Form8960Facts, isMarried: boolean): Form8960Lines {
  return {
    taxableInterest: facts.taxableInterest,
    ordinaryDividends: facts.ordinaryDividends,
    netCapGains: facts.netCapGains,
    passiveIncome: facts.passiveIncome,
    nonpassiveTradingIncome: facts.nonpassiveTradingIncome,
    investmentInterestExpense: facts.investmentInterestExpense,
    grossNII: facts.grossNII,
    totalDeductions: facts.totalDeductions,
    netInvestmentIncome: facts.netInvestmentIncome,
    magi: facts.magi ?? 0,
    threshold: isMarried ? facts.thresholdMarriedFilingJointly ?? 250_000 : facts.thresholdSingle ?? 200_000,
    magiExcess: isMarried ? facts.magiExcessMarriedFilingJointly ?? 0 : facts.magiExcessSingle ?? 0,
    niitTax: isMarried ? facts.niitTaxMarriedFilingJointly ?? 0 : facts.niitTaxSingle ?? 0,
    components: facts.componentSources.map(source => ({
      label: source.label,
      amount: source.amount,
      ...(source.box ? { boxRef: source.box } : {}),
    })),
    interestSources: sourceLines(facts.componentSources.filter(source => source.routing === 'form_8960_line_1')),
    dividendSources: sourceLines(facts.componentSources.filter(source => source.routing === 'form_8960_line_2')),
    passiveSources: sourceLines(facts.componentSources.filter(source => source.routing === 'form_8960_line_4a')),
  }
}

export function form8995FactsToLines(facts: Form8995Facts): Form8995Lines {
  const form8995AEntities = new Map((facts.form8995A?.entities ?? []).map(entity => [entity.entityKey, entity]))

  return {
    entries: facts.entities.map((entity) => {
      const form8995AEntity = form8995AEntities.get(entity.entityKey)

      return {
        label: entity.label,
        qbiIncome: entity.qbiIncome,
        qbiLossNettingAdjustment: form8995AEntity?.qbiLossNettingAdjustment ?? 0,
        qbiAfterLossNetting: form8995AEntity?.qbiAfterLossNetting ?? entity.qbiIncome,
        w2Wages: form8995AEntity?.w2Wages ?? entity.w2Wages,
        ubia: form8995AEntity?.ubia ?? entity.ubia,
        reitDividends: entity.reitDividends,
        ptpIncome: entity.ptpIncome,
        isSstb: entity.isSstb,
        sectionNotes: entity.sectionNotes ?? '',
        qbiComponent: form8995AEntity?.qualifiedBusinessIncomeComponent ?? entity.qbiComponent,
      }
    }),
    totalQBI: facts.totalQbi,
    totalQBIComponent: facts.form8995A?.totalQualifiedBusinessIncomeComponent ?? facts.totalQbiComponent,
    totalIncome: facts.taxableIncomeBeforeQbi,
    estimatedTaxableIncome: facts.taxableIncomeBeforeQbi,
    stdDedApplied: 0,
    taxableIncomeCap: facts.taxableIncomeCap,
    estimatedDeduction: facts.form8995A?.deduction ?? facts.deduction,
    aboveThreshold: facts.aboveThreshold,
    thresholdSingle: facts.thresholdSingle,
    thresholdMFJ: facts.thresholdMarriedFilingJointly,
  }
}

export function schedule2FromFacts(facts: TaxPreviewFacts, isMarried: boolean): Schedule2Lines {
  const form8960 = form8960FactsToLines(facts.form8960, isMarried)

  return {
    altMinimumTax: facts.form6251.amt,
    selfEmploymentTax: facts.scheduleSE.seTax,
    additionalMedicareTax: facts.scheduleSE.additionalMedicareTax,
    niit: form8960.niitTax,
    totalAdditionalTaxes: facts.form1040.line23,
  }
}

export function taxPreviewFactsToTaxReturn(facts: TaxPreviewFacts, options: TaxReturnFactsOptions): TaxReturn1040 {
  return {
    year: facts.year,
    ...(options.overviewSections ? { overviewSections: options.overviewSections } : {}),
    schedule1: schedule1FactsToLines(facts.schedule1),
    schedule2: schedule2FromFacts(facts, options.isMarried),
    scheduleA: scheduleAFactsToLines(facts.scheduleA, options.isMarried),
    scheduleB: scheduleBFactsToLines(facts.scheduleB),
    scheduleC: scheduleCNetIncomeFromFacts(facts.scheduleC),
    scheduleD: scheduleDDataFromFacts(facts.scheduleD),
    scheduleE: scheduleEFactsToLines(facts.scheduleE),
    scheduleSE: scheduleSEFactsToLines(facts.scheduleSE),
    form4952: form4952FactsToLines(facts.form4952),
    form1116: form1116FactsToLines(facts.form1116),
    form6251: form6251FactsToLines(facts.form6251),
    form8959: options.form8959,
    form8960: form8960FactsToLines(facts.form8960, options.isMarried),
    form8995: form8995FactsToLines(facts.form8995),
    capitalLossCarryover: options.capitalLossCarryover,
    form461: options.form461,
    form8582: form8582FactsToLines(facts.form8582),
    form8606: form8606FactsToLines(facts.form8606),
    form4797: form4797FactsToLines(facts.form4797),
    scheduleF: scheduleFFactsToLines(facts.scheduleF),
    ...(options.estimatedTaxPayments ? { estimatedTaxPayments: options.estimatedTaxPayments } : {}),
    ...(options.k1Docs ? { k1Docs: options.k1Docs } : {}),
    ...(options.k3Docs ? { k3Docs: options.k3Docs } : {}),
    ...(options.docs1099 ? { docs1099: options.docs1099 } : {}),
    ...(options.shortDividends ? { shortDividends: options.shortDividends } : {}),
  }
}
