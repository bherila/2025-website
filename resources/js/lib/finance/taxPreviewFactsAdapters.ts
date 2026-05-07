import currency from 'currency.js'

import { form1040FactsToLines } from '@/components/finance/Form1040Preview'
import { form8995FactsToLines } from '@/components/finance/Form8995Preview'
import { isFK1StructuredData } from '@/components/finance/k1'
import { scheduleFFactsToLines } from '@/components/finance/ScheduleFPreview'
import { accountLast4FromValue } from '@/lib/finance/form8949Extraction'
import { k1NetIncome, parseK1Field } from '@/lib/finance/k1Utils'
import type { ShortDividendSummary } from '@/lib/finance/shortDividendAnalysis'
import type { ScheduleDData } from '@/lib/tax/scheduleD'
import type { TaxDocument } from '@/types/finance/tax-document'
import { FORM_TYPE_LABELS } from '@/types/finance/tax-document'
import type {
  CapitalLossCarryoverLines,
  Form461Lines,
  Form1116Lines,
  Form4952Lines,
  Form6251Lines,
  Form8582Lines,
  Form8959Lines,
  Form8960Lines,
  OverviewRow,
  Schedule1Lines,
  Schedule2Lines,
  ScheduleALines,
  ScheduleBLines,
  ScheduleCNetIncome,
  ScheduleELines,
  ScheduleSEEntrySourceType,
  ScheduleSELines,
  TaxReturn1040,
} from '@/types/finance/tax-return'
import type {
  Form1116Facts,
  Form4952Facts,
  Form6251Facts,
  Form8582Facts,
  Form8960Facts,
  Schedule1Facts,
  ScheduleAFacts,
  ScheduleBFacts,
  ScheduleCFacts,
  ScheduleDFacts,
  ScheduleEFacts,
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

function toTaxReturnYearK1Entries(reviewedK1Docs: TaxDocument[]): NonNullable<TaxReturn1040['k1Docs']> {
  return reviewedK1Docs
    .map((doc) => {
      if (!isFK1StructuredData(doc.parsed_data)) {
        return null
      }

      const entityName =
        doc.parsed_data.fields['B']?.value?.split('\n')[0] ??
        doc.employment_entity?.display_name ??
        doc.original_filename ??
        `K1-${doc.id}`
      const ein = doc.parsed_data.fields['A']?.value ?? undefined
      const fields = Object.fromEntries(
        Object.entries(doc.parsed_data.fields)
          .filter(([, field]) => field?.value !== null && field?.value !== undefined && field?.value !== '')
          .map(([key, field]) => {
            const n = Number(field.value)
            return [key, Number.isNaN(n) ? String(field.value) : n]
          }),
      )
      const codes = Object.fromEntries(
        Object.entries(doc.parsed_data.codes).map(([box, items]) => [
          box,
          items.map(item => ({
            code: item.code,
            value: item.value,
            ...(item.notes ? { notes: item.notes } : {}),
            ...(item.character ? { character: item.character } : {}),
          })),
        ]),
      )

      return {
        entityName,
        ...(ein ? { ein } : {}),
        fields,
        codes,
        ...(doc.parsed_data.k3?.sections ? { k3Sections: doc.parsed_data.k3.sections } : {}),
        ...(doc.parsed_data.passiveActivities?.length ? { passiveActivities: doc.parsed_data.passiveActivities } : {}),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

export function buildTaxReturnForWorkbook({
  year,
  taxFacts,
  isMarried,
  reviewedW2Docs,
  reviewedK1Docs,
  reviewed1099Docs,
  form8959,
  form461,
  capitalLossCarryover,
  estimatedTaxPayments,
  shortDividendSummary,
}: {
  year: number
  taxFacts: TaxPreviewFacts | null
  isMarried: boolean
  reviewedW2Docs: TaxDocument[]
  reviewedK1Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  form8959: Form8959Lines
  form461: Form461Lines
  capitalLossCarryover: CapitalLossCarryoverLines
  estimatedTaxPayments?: TaxReturn1040['estimatedTaxPayments']
  shortDividendSummary: ShortDividendSummary | null
}): TaxReturn1040 {
  const structuredK1Docs = reviewedK1Docs
    .map((doc) => ({ doc, data: isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null }))
    .filter((entry): entry is { doc: TaxDocument; data: NonNullable<typeof entry.data> } => entry.data !== null)

  const docRows: OverviewRow[] = []
  for (const doc of reviewedW2Docs) {
    const parsedData = doc.parsed_data as Record<string, unknown>
    const employer = (parsedData?.employer_name as string | undefined) ?? doc.employment_entity?.display_name ?? doc.account?.acct_name ?? '—'
    const wages = parsedData?.box1_wages as number | undefined
    const fedTax = parsedData?.box2_fed_tax as number | undefined
    docRows.push({
      item: `${employer} — W-2`,
      amount: wages,
      note: fedTax != null ? `Fed WH: ${currency(fedTax).format()}` : undefined,
    })
  }

  for (const { doc, data } of structuredK1Docs) {
    const partnerName = data.fields['B']?.value?.split('\n')[0] ?? doc.employment_entity?.display_name ?? 'Partnership K-1'
    const net = k1NetIncome(data)
    const interest = parseK1Field(data, '5')
    const foreignTax = parseK1Field(data, '21')
    const noteParts = [
      net < 0 ? 'Net loss — Schedule E' : 'Net income — Schedule E',
      interest !== 0 ? `Interest: ${currency(interest).format()}` : null,
      foreignTax !== 0 ? `Foreign tax: ${currency(foreignTax).format()}` : null,
    ].filter(Boolean)
    docRows.push({ item: `${partnerName} — K-1`, amount: net, note: noteParts.join(' · ') })
  }

  for (const doc of reviewed1099Docs) {
    const parsedData = doc.parsed_data as Record<string, unknown>
    const isBroker = doc.form_type === 'broker_1099'
    const payer = (parsedData?.payer_name as string | undefined) ?? doc.employment_entity?.display_name ?? doc.account?.acct_name ?? '—'
    const interest = parsedData?.box1_interest as number | undefined
    const ordDiv = parsedData?.box1a_ordinary as number | undefined
    const grossDistribution = doc.form_type === '1099_r' ? (parsedData?.box1_gross_distribution as number | undefined) : undefined
    const taxableDistribution = doc.form_type === '1099_r'
      ? ((parsedData?.box2a_taxable_amount as number | undefined) ?? (parsedData?.box1_gross_distribution as number | undefined))
      : undefined
    const foreignTax = (parsedData?.box7_foreign_tax ?? parsedData?.box6_foreign_tax) as number | undefined
    const capGainLoss = isBroker ? (parsedData?.total_realized_gain_loss as number | undefined) : undefined
    const fedTaxWithheld = doc.form_type === '1099_r' ? (parsedData?.box4_fed_tax as number | undefined) : undefined
    const label = FORM_TYPE_LABELS[doc.form_type] ?? doc.form_type
    const noteParts = [
      interest != null && interest !== 0 ? `Interest: ${currency(interest).format()}` : null,
      ordDiv != null && ordDiv !== 0 ? `Ord div: ${currency(ordDiv).format()}` : null,
      grossDistribution != null && grossDistribution !== 0 ? `Gross dist: ${currency(grossDistribution).format()}` : null,
      taxableDistribution != null && taxableDistribution !== 0 ? `Taxable dist: ${currency(taxableDistribution).format()}` : null,
      capGainLoss != null && capGainLoss !== 0 ? `Cap G/L: ${currency(capGainLoss).format()}` : null,
      foreignTax != null && foreignTax !== 0 ? `Foreign tax: ${currency(foreignTax, { precision: 2 }).format()}` : null,
      fedTaxWithheld != null && fedTaxWithheld !== 0 ? `Fed WH: ${currency(fedTaxWithheld).format()}` : null,
    ].filter(Boolean)
    const primaryAmount = currency(interest ?? 0)
      .add(ordDiv ?? 0)
      .add(grossDistribution ?? 0).value
    docRows.push({
      item: `${payer} — ${label}`,
      amount: primaryAmount !== 0 ? primaryAmount : undefined,
      note: noteParts.join(' · ') || undefined,
    })
  }

  const taxPositionRows: OverviewRow[] = []
  if (taxFacts) {
    const totalInvestmentIncome = currency(taxFacts.scheduleB.interestTotal)
      .add(taxFacts.scheduleB.ordinaryDividendTotal).value

    if (taxFacts.form1040.line1z > 0) taxPositionRows.push({ item: 'W-2 Wages', amount: taxFacts.form1040.line1z, note: 'Form 1040 line 1z' })
    if (totalInvestmentIncome !== 0) taxPositionRows.push({ item: 'Net investment income (interest + divs)', amount: totalInvestmentIncome, note: 'Before deductions; subject to NIIT (3.8%)' })
    if (taxFacts.scheduleD.line16Combined !== 0) taxPositionRows.push({ item: 'Net capital gain (loss)', amount: taxFacts.scheduleD.line16Combined, note: 'Schedule D line 16' })
    if (taxFacts.scheduleD.ambiguous11SSources.length > 0) taxPositionRows.push({ item: 'K-1 Box 11S character review needed', amount: taxFacts.scheduleD.ambiguous11SAmount, note: `${taxFacts.scheduleD.ambiguous11SSources.length} non-portfolio capital gain/loss line(s) need S/T or L/T classification before Schedule D routing.` })
    if (taxFacts.form4952.totalInvestmentInterestExpense !== 0) taxPositionRows.push({ item: 'Investment interest deduction (Form 4952)', amount: taxFacts.form4952.totalInvestmentInterestExpense, note: 'Deductible amount flows to Schedule A line 9' })
    if (taxFacts.form1116.totalForeignTaxes !== 0) taxPositionRows.push({ item: 'Foreign tax credit (Form 1116)', amount: taxFacts.form1116.totalForeignTaxes, note: 'Dollar-for-dollar vs. income tax' })
    if (taxFacts.form1040.line25d > 0) taxPositionRows.push({ item: 'Federal withholding', amount: taxFacts.form1040.line25d, note: 'Form 1040 line 25d' })
  }

  if (form8959.additionalTax > 0) {
    taxPositionRows.push({ item: 'Additional Medicare Tax (Form 8959)', amount: -form8959.additionalTax, note: '0.9% on Medicare wages over the filing-status threshold' })
  }

  const overviewSections = [
    ...(docRows.length > 0 ? [{ heading: 'Tax Documents', rows: docRows }] : []),
    ...(taxPositionRows.length > 0 ? [{ heading: 'Estimated Tax Positions', rows: taxPositionRows }] : []),
  ]

  const k1Docs = toTaxReturnYearK1Entries(reviewedK1Docs)
  const k3Docs = reviewedK1Docs
    .map((doc) => {
      const parsed = isFK1StructuredData(doc.parsed_data) ? doc.parsed_data : null
      if (!parsed) {
        return null
      }

      return {
        entityName:
          parsed.fields['B']?.value?.split('\n')[0] ??
          doc.employment_entity?.display_name ??
          doc.original_filename ??
          `K3-${doc.id}`,
        sections: parsed.k3?.sections ?? [],
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  const docs1099 = reviewed1099Docs.map((doc) => {
    const parsedData = (doc.parsed_data ?? {}) as Record<string, unknown> | Record<string, unknown>[]
    const firstBrokerEntry = Array.isArray(parsedData)
      ? parsedData.find((entry) => typeof entry.account_name === 'string')
      : null
    const payerName = !Array.isArray(parsedData)
      ? (parsedData.payer_name as string | undefined) ?? doc.account?.acct_name ?? doc.original_filename ?? `Doc-${doc.id}`
      : (firstBrokerEntry?.account_name as string | undefined) ?? doc.account?.acct_name ?? doc.original_filename ?? `Doc-${doc.id}`
    const accountLast4 = !Array.isArray(parsedData)
      ? accountLast4FromValue(parsedData.account_number) ?? accountLast4FromValue(doc.account?.acct_number)
      : accountLast4FromValue(doc.account?.acct_number)

    return {
      formType: doc.form_type,
      payerName,
      parsedData,
      accountId: doc.account_id,
      accountName: doc.account?.acct_name ?? null,
      accountLast4,
      accountLinks: (doc.account_links ?? []).map((link) => ({
        id: link.id,
        account_id: link.account_id,
        form_type: link.form_type,
        reporting_mode: link.reporting_mode ?? null,
        ai_identifier: link.ai_identifier,
        ai_account_name: link.ai_account_name,
        account: link.account,
      })),
    }
  })

  if (!taxFacts) {
    return {
      year,
      ...(overviewSections.length > 0 ? { overviewSections } : {}),
      scheduleC: scheduleCNetIncomeFromFacts(undefined),
      form8959,
      form461,
      capitalLossCarryover,
      k1Docs,
      k3Docs,
      docs1099,
      ...(shortDividendSummary ? { shortDividends: shortDividendSummary } : {}),
    }
  }

  return {
    ...taxPreviewFactsToTaxReturn(taxFacts, {
      isMarried,
      form8959,
      form461,
      capitalLossCarryover,
      ...(overviewSections.length > 0 ? { overviewSections } : {}),
      k1Docs,
      k3Docs,
      docs1099,
      ...(shortDividendSummary ? { shortDividends: shortDividendSummary } : {}),
      ...(estimatedTaxPayments ? { estimatedTaxPayments } : {}),
    }),
    year,
    form1040: form1040FactsToLines(taxFacts.form1040),
  }
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
      line1a_taxableRefunds: facts.line1aTotal === 0 ? null : facts.line1aTotal,
      line2a_alimonyReceived: facts.line2aTotal === 0 ? null : facts.line2aTotal,
      line3_business: facts.line3Total,
      line4_otherGains: facts.line4Total === 0 ? null : facts.line4Total,
      line5_rentalPartnerships: facts.line5Total,
      line6_farmIncome: facts.line6Total === 0 ? null : facts.line6Total,
      line7_unemploymentCompensation: facts.line7Total === 0 ? null : facts.line7Total,
      line8b_gambling: facts.line8bTotal === 0 ? null : facts.line8bTotal,
      line8h_juryDuty: facts.line8hTotal === 0 ? null : facts.line8hTotal,
      line8i_prizes: facts.line8iTotal === 0 ? null : facts.line8iTotal,
      line8z_otherIncome: facts.line8zTotal,
      line9_totalOther: facts.line9TotalOtherIncome,
      line10_total: currency(facts.line3Total)
        .add(facts.line1aTotal)
        .add(facts.line2aTotal)
        .add(facts.line4Total)
        .add(facts.line5Total)
        .add(facts.line6Total)
        .add(facts.line7Total)
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

export function emptyScheduleDFacts(): ScheduleDFacts {
  return {
    form8949Rollups: [],
    line5Sources: [],
    line3Sources: [],
    line10Sources: [],
    line12Sources: [],
    line13Sources: [],
    ambiguous11SSources: [],
    line1aGainLoss: 0,
    line1bGainLoss: 0,
    line2GainLoss: 0,
    line3GainLoss: 0,
    line4GainLoss: 0,
    line5GainLoss: 0,
    line6Carryover: 0,
    line7NetShortTerm: 0,
    line8aGainLoss: 0,
    line8bGainLoss: 0,
    line9GainLoss: 0,
    line10GainLoss: 0,
    line11GainLoss: 0,
    line12GainLoss: 0,
    line13CapitalGainDistributions: 0,
    line14Carryover: 0,
    line15NetLongTerm: 0,
    line16Combined: 0,
    line21LimitedLossOrGain: 0,
    appliedToReturn: 0,
    carryforward: 0,
    totalBusinessCapGains: 0,
    totalPersonalCapGains: 0,
    limitedBusinessCapGains: 0,
    limitedPersonalCapGains: 0,
    ambiguous11SAmount: 0,
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

export function schedule2FromFacts(facts: TaxPreviewFacts, isMarried: boolean, form8959: Form8959Lines): Schedule2Lines {
  const form8960 = form8960FactsToLines(facts.form8960, isMarried)

  return {
    altMinimumTax: facts.form6251.amt,
    selfEmploymentTax: facts.scheduleSE.seTax,
    additionalMedicareTax: currency(facts.scheduleSE.additionalMedicareTax).add(form8959.additionalTax).value,
    niit: form8960.niitTax,
    totalAdditionalTaxes: facts.form1040.line23,
  }
}

export function taxPreviewFactsToTaxReturn(facts: TaxPreviewFacts, options: TaxReturnFactsOptions): TaxReturn1040 {
  return {
    year: facts.year,
    ...(options.overviewSections ? { overviewSections: options.overviewSections } : {}),
    schedule1: schedule1FactsToLines(facts.schedule1),
    schedule2: schedule2FromFacts(facts, options.isMarried, options.form8959),
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
    form8606: facts.form8606,
    form4797: facts.form4797,
    scheduleF: scheduleFFactsToLines(facts.scheduleF),
    ...(options.estimatedTaxPayments ? { estimatedTaxPayments: options.estimatedTaxPayments } : {}),
    ...(options.k1Docs ? { k1Docs: options.k1Docs } : {}),
    ...(options.k3Docs ? { k3Docs: options.k3Docs } : {}),
    ...(options.docs1099 ? { docs1099: options.docs1099 } : {}),
    ...(options.shortDividends ? { shortDividends: options.shortDividends } : {}),
  }
}
