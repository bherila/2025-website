
import currency from 'currency.js'

import ActionItemsTab from '@/components/finance/ActionItemsTab'
import AdditionalTaxesPreview from '@/components/finance/AdditionalTaxesPreview'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form1116Preview from '@/components/finance/Form1116Preview'
import Form4797Preview from '@/components/finance/Form4797Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import Form6251Preview from '@/components/finance/Form6251Preview'
import Form8582Preview from '@/components/finance/Form8582Preview'
import Form8606Preview from '@/components/finance/Form8606Preview'
import Form8949Preview from '@/components/finance/Form8949Preview'
import Form8995Preview from '@/components/finance/Form8995Preview'
import Schedule1Preview from '@/components/finance/Schedule1Preview'
import Schedule3Preview, { computeSchedule3 } from '@/components/finance/Schedule3Preview'
import ScheduleAPreview from '@/components/finance/ScheduleAPreview'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import ScheduleCTab from '@/components/finance/ScheduleCTab'
import ScheduleDPreview from '@/components/finance/ScheduleDPreview'
import ScheduleEPreview from '@/components/finance/ScheduleEPreview'
import ScheduleFPreview from '@/components/finance/ScheduleFPreview'
import ScheduleSEPreview from '@/components/finance/ScheduleSEPreview'
import { TAB_TO_FORM_ID, type TaxTabId } from '@/components/finance/tax-tab-ids'
import TaxDocuments1099Section from '@/components/finance/TaxDocuments1099Section'
import TaxDocumentsSection from '@/components/finance/TaxDocumentsSection'
import WorksheetAmtExemption from '@/components/finance/worksheets/WorksheetAmtExemption'
import WorksheetSE401k from '@/components/finance/worksheets/WorksheetSE401k'
import WorksheetTaxableSS from '@/components/finance/worksheets/WorksheetTaxableSS'
import WorksheetColumn1116 from '@/finance/1116/WorksheetColumn'
import {
  buildEstimatedTaxSheet,
  buildForm1116Sheet,
  buildForm4952Sheet,
  buildForm6251Sheet,
  buildForm8582Sheet,
  buildForm8995Sheet,
  buildOverviewSheet,
  buildScheduleBSheet,
  buildScheduleCSheet,
  buildScheduleDSheet,
  buildScheduleESheet,
  buildScheduleSESheet,
} from '@/lib/finance/buildTaxWorkbook'

import { useDockActions } from './DockActions'
import type { DrillTarget, FormId, FormRegistry, FormRenderProps } from './formRegistry'
import { summarizeTaxEstimate, TaxEstimateFullDetail } from './TaxEstimateHeader'

/**
 * Adapts a legacy `onTabChange(TaxTabId)` callback to the Miller `onDrill`
 * pipeline so previews wired for tab navigation automatically push columns
 * when rendered in dock mode.
 */
function tabToDrill(onDrill: (t: DrillTarget) => void): (tab: TaxTabId) => void {
  return (tab) => {
    const formId = TAB_TO_FORM_ID[tab] as FormId | undefined
    if (formId) {
      onDrill({ form: formId })
    }
  }
}

function Form1040Adapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  return (
    <Form1040Preview
      lines={state.taxReturn.form1040 ?? []}
      selectedYear={state.year}
      onNavigate={tabToDrill(onDrill)}
    />
  )
}

function Schedule1Adapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  const alimonyInput = (
    <Schedule1AlimonyInput
      value={state.schedule1Line2aAlimony}
      onChange={state.setSchedule1Line2aAlimony}
    />
  )
  return (
    <Schedule1Preview
      selectedYear={state.year}
      schedule1={state.taxReturn.schedule1}
      line2aAlimonyInput={alimonyInput}
      onTabChange={tabToDrill(onDrill)}
    />
  )
}

function Schedule1AlimonyInput({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}): React.ReactElement {
  return (
    <input
      type="number"
      aria-label="Alimony received (pre-2019 decrees)"
      className="w-28 rounded border px-2 py-0.5 text-right text-[11px]"
      value={value === 0 ? '' : value}
      placeholder="0"
      step="0.01"
      onChange={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') {
          onChange(0)
          return
        }
        const n = parseFloat(raw)
        onChange(isNaN(n) ? 0 : n)
      }}
    />
  )
}

function Schedule2Adapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  return (
    <AdditionalTaxesPreview
      schedule2={state.taxReturn.schedule2}
      scheduleSE={state.taxReturn.scheduleSE}
      form8959={state.taxReturn.form8959}
      form8960={state.taxReturn.form8960}
      capitalLossCarryover={state.taxReturn.capitalLossCarryover}
      form461={state.taxReturn.form461}
      onTabChange={tabToDrill(onDrill)}
    />
  )
}

function ScheduleAAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <ScheduleAPreview
      selectedYear={state.year}
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      isMarried={state.isMarried}
      userDeductions={state.userDeductions}
      {...(state.shortDividendSummary ? { shortDividendSummary: state.shortDividendSummary } : {})}
    />
  )
}

function ScheduleBAdapter({ state }: FormRenderProps): React.ReactElement {
  const { reviewK1Doc } = useDockActions()
  return (
    <ScheduleBPreview
      interestIncome={state.income1099.interestIncome}
      dividendIncome={state.income1099.dividendIncome}
      qualifiedDividends={state.income1099.qualifiedDividends}
      selectedYear={state.year}
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      onOpenDoc={reviewK1Doc}
    />
  )
}

function ScheduleDAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <ScheduleDPreview
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      selectedYear={state.year}
    />
  )
}

function ScheduleEAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <ScheduleEPreview
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      selectedYear={state.year}
    />
  )
}

function ScheduleSEAdapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  const { reviewK1Doc } = useDockActions()
  return (
    <ScheduleSEPreview
      reviewedK1Docs={state.reviewedK1Docs}
      scheduleCNetIncome={state.scheduleCNetIncome.total}
      selectedYear={state.year}
      isMarried={state.isMarried}
      reviewedW2Docs={state.reviewedW2Docs}
      payslips={state.payslips}
      onOpenDoc={reviewK1Doc}
      onGoToScheduleC={() => onDrill({ form: 'sch-c' })}
    />
  )
}

function Form4952Adapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <Form4952Preview
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      income1099={state.income1099}
      {...(state.shortDividendSummary
        ? { shortDividendDeduction: state.shortDividendSummary.totalItemizedDeduction }
        : {})}
    />
  )
}

function Form6251Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Form6251Preview form6251={state.taxReturn.form6251} selectedYear={state.year} />
}

function Form8995Adapter({ state }: FormRenderProps): React.ReactElement {
  const totalIncome = state.taxReturn.form8995?.totalIncome ?? 0
  return (
    <Form8995Preview
      reviewedK1Docs={state.reviewedK1Docs}
      totalIncome={totalIncome}
      selectedYear={state.year}
      isMarried={state.isMarried}
    />
  )
}

function Form8582Adapter({ state }: FormRenderProps): React.ReactElement {
  if (!state.taxReturn.form8582) {
    return (
      <StubCard
        title="Form 8582 — Passive Activity Loss Limitations"
        note="No passive activity data available. Add a Schedule E rental property or a K-1 with passive losses to populate this form."
      />
    )
  }
  return (
    <Form8582Preview
      form8582={state.taxReturn.form8582}
      year={state.year}
      palCarryforwards={state.palCarryforwards}
      onCarryforwardsChange={state.setPalCarryforwards}
      realEstateProfessional={state.realEstateProfessional}
      onRealEstateProfessionalChange={state.setRealEstateProfessional}
    />
  )
}

function HomePlaceholder(): React.ReactElement {
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">Home</h2>
      <p className="text-sm text-muted-foreground">
        Account documents, KPI cards, and action items will live here.
      </p>
    </div>
  )
}

function StubCard({ title, note }: { title: string; note: string }): React.ReactElement {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/30 p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  )
}

function Schedule3Adapter({ state }: FormRenderProps): React.ReactElement {
  const schedule3 = computeSchedule3({ form1116: state.taxReturn.form1116 })
  return <Schedule3Preview schedule3={schedule3} selectedYear={state.year} />
}

function Form1116Adapter({ state, instance, onDrill }: FormRenderProps): React.ReactElement {
  const { reviewK1Doc, bulkSetSbpElection } = useDockActions()
  if (!state.taxReturn.form1116) {
    return (
      <StubCard
        title="Form 1116 — Foreign Tax Credit"
        note="No foreign tax data detected. Add a 1099-DIV with box 7 foreign tax paid or a K-1 with K-3 foreign income to populate this form."
      />
    )
  }
  const allK1Docs = state.accountDocuments.filter((doc) => doc.form_type === 'k1')
  const category = instance?.key === 'general' || instance?.key === 'passive' ? instance.key : undefined
  return (
    <Form1116Preview
      form1116={state.taxReturn.form1116}
      foreignTaxSummaries={state.foreignTaxSummaries}
      allK1Docs={allK1Docs}
      selectedYear={state.year}
      onReviewNow={reviewK1Doc}
      onBulkSetSbpElection={bulkSetSbpElection}
      onOpenWorksheet={() => onDrill({ form: 'wks-1116-apportionment' })}
      {...(category ? { category } : {})}
    />
  )
}

function Worksheet1116Adapter({ state }: FormRenderProps): React.ReactElement {
  const { reviewK1Doc } = useDockActions()
  return (
    <WorksheetColumn1116
      foreignTaxSummaries={state.foreignTaxSummaries}
      taxYear={state.year}
      onOpenDoc={reviewK1Doc}
    />
  )
}

function ScheduleCAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <ScheduleCTab
      selectedYear={state.year}
      scheduleCData={state.scheduleCData?.years ?? []}
      reviewed1099Docs={state.reviewed1099Docs}
    />
  )
}

function Form4797Adapter({ state }: FormRenderProps): React.ReactElement {
  if (!state.taxReturn.form4797) {
    return (
      <StubCard
        title="Form 4797 — Sales of Business Property"
        note="Form 4797 is not yet populated. Check the tax preview context wiring."
      />
    )
  }
  return (
    <Form4797Preview
      selectedYear={state.year}
      form4797={state.taxReturn.form4797}
      partINet1231Input={
        <NumericInput
          value={state.form4797PartINet1231}
          onChange={state.setForm4797PartINet1231}
          ariaLabel="Form 4797 Part I net §1231 gain or loss"
        />
      }
      partIIOrdinaryInput={
        <NumericInput
          value={state.form4797PartIIOrdinary}
          onChange={state.setForm4797PartIIOrdinary}
          ariaLabel="Form 4797 Part II ordinary gain or loss"
        />
      }
      partIIIRecaptureInput={
        <NumericInput
          value={state.form4797PartIIIRecapture}
          onChange={state.setForm4797PartIIIRecapture}
          ariaLabel="Form 4797 Part III depreciation recapture"
        />
      }
    />
  )
}

function ScheduleFAdapter({ state }: FormRenderProps): React.ReactElement {
  if (!state.taxReturn.scheduleF) {
    return (
      <StubCard
        title="Schedule F — Profit or Loss From Farming"
        note="Schedule F is not yet populated. Check the tax preview context wiring."
      />
    )
  }
  return (
    <ScheduleFPreview
      selectedYear={state.year}
      scheduleF={state.taxReturn.scheduleF}
      grossFarmIncomeInput={
        <NumericInput
          value={state.scheduleFGrossIncome}
          onChange={state.setScheduleFGrossIncome}
          ariaLabel="Schedule F gross farm income"
        />
      }
      totalExpensesInput={
        <NumericInput
          value={state.scheduleFTotalExpenses}
          onChange={state.setScheduleFTotalExpenses}
          ariaLabel="Schedule F total farm expenses"
        />
      }
    />
  )
}

function NumericInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number
  onChange: (next: number) => void
  ariaLabel: string
}): React.ReactElement {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      className="w-32 rounded border px-2 py-0.5 text-right text-[11px]"
      value={value === 0 ? '' : value}
      placeholder="0"
      step="0.01"
      onChange={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') {
          onChange(0)
          return
        }
        const n = parseFloat(raw)
        onChange(isNaN(n) ? 0 : n)
      }}
    />
  )
}

function Form8606Adapter({ state }: FormRenderProps): React.ReactElement {
  if (!state.taxReturn.form8606) {
    return (
      <StubCard
        title="Form 8606 — Nondeductible IRAs"
        note="Form 8606 data is not yet populated. Check the tax preview context wiring."
      />
    )
  }
  return (
    <Form8606Preview
      selectedYear={state.year}
      form8606={state.taxReturn.form8606}
      nondeductibleContributionsInput={
        <Form8606NumericInput
          value={state.form8606NondeductibleContributions}
          onChange={state.setForm8606NondeductibleContributions}
          ariaLabel="Nondeductible contributions to traditional IRA"
        />
      }
      priorYearBasisInput={
        <Form8606NumericInput
          value={state.form8606PriorYearBasis}
          onChange={state.setForm8606PriorYearBasis}
          ariaLabel="Prior-year Form 8606 basis carryforward"
        />
      }
      yearEndFmvInput={
        <Form8606NumericInput
          value={state.form8606YearEndFmv}
          onChange={state.setForm8606YearEndFmv}
          ariaLabel="Year-end FMV of traditional/SEP/SIMPLE IRAs"
        />
      }
    />
  )
}

function Form8606NumericInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number
  onChange: (next: number) => void
  ariaLabel: string
}): React.ReactElement {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      className="w-28 rounded border px-2 py-0.5 text-right text-[11px]"
      value={value === 0 ? '' : value}
      placeholder="0"
      step="0.01"
      onChange={(e) => {
        const raw = e.target.value.trim()
        if (raw === '') {
          onChange(0)
          return
        }
        const n = parseFloat(raw)
        onChange(isNaN(n) ? 0 : n)
      }}
    />
  )
}

function Form8949Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Form8949Preview selectedYear={state.year} />
}

function ActionItemsAdapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  const w2GrossIncome = state.payslips.reduce(
    (acc, row) =>
      acc
        .add(row.ps_salary ?? 0)
        .add(row.earnings_bonus ?? 0)
        .add(row.earnings_rsu ?? 0)
        .add(row.ps_vacation_payout ?? 0)
        .add(row.imp_ltd ?? 0)
        .add(row.imp_legal ?? 0)
        .add(row.imp_fitness ?? 0)
        .add(row.imp_other ?? 0)
        .subtract(row.ps_401k_pretax ?? 0)
        .subtract(row.ps_pretax_medical ?? 0)
        .subtract(row.ps_pretax_dental ?? 0)
        .subtract(row.ps_pretax_vision ?? 0)
        .subtract(row.ps_pretax_fsa ?? 0),
    currency(0),
  )
  return (
    <ActionItemsTab
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      reviewedW2Docs={state.reviewedW2Docs}
      income1099={state.income1099}
      w2GrossIncome={w2GrossIncome}
      selectedYear={state.year}
      onTabChange={tabToDrill(onDrill)}
    />
  )
}

function EstimateAdapter({ state }: FormRenderProps): React.ReactElement {
  const summary = summarizeTaxEstimate({
    taxReturn: state.taxReturn,
    year: state.year,
    isMarried: state.isMarried,
    payslips: state.payslips,
    reviewed1099RDocs: state.reviewed1099RDocs,
  })
  return <TaxEstimateFullDetail summary={summary} />
}

function DocumentsAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <TaxDocumentsSection
        selectedYear={state.year}
        payslips={state.payslips}
        documents={state.w2Documents}
        employmentEntities={state.employmentEntities}
        isLoading={state.isLoading}
        onDocumentsReload={state.refreshAll}
      />
      <TaxDocuments1099Section
        selectedYear={state.year}
        documents={state.accountDocuments}
        accounts={state.accounts}
        activeAccountIds={state.activeAccountIds}
        foreignTaxSummaries={state.foreignTaxSummaries}
        isLoading={state.isLoading}
        onDocumentsReload={state.refreshAll}
      />
    </div>
  )
}


/**
 * Registry of all forms. Read-only forms have full adapters wired to
 * TaxPreviewState; mutation-bearing forms (1116, 8582, Sch C, Sch 3,
 * etc.) and worksheets currently render placeholder StubCards pending
 * full migration.
 */
export const formRegistry: FormRegistry = {
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    keywords: ['home', 'dashboard', 'overview'],
    category: 'App',
    presentation: 'app',
    component: HomePlaceholder,
    xlsx: {
      sheetName: () => 'Overview',
      order: 10,
      build: buildOverviewSheet,
    },
  },
  'form-1040': {
    id: 'form-1040',
    label: 'Form 1040 — U.S. Individual Income Tax Return',
    shortLabel: '1040',
    formNumber: '1040',
    keywords: ['1040', 'individual', 'income tax', 'main return'],
    category: 'Form',
    presentation: 'column',
    component: Form1040Adapter,
  },
  'sch-1': {
    id: 'sch-1',
    label: 'Schedule 1 — Additional Income & Adjustments',
    shortLabel: 'Sch 1',
    formNumber: '1',
    keywords: ['schedule 1', 'additional income', 'adjustments', 'unemployment', 'state refund'],
    category: 'Schedule',
    presentation: 'column',
    component: Schedule1Adapter,
    keyAmounts: (state) => {
      const s1 = state.taxReturn.schedule1
      if (!s1) {
        return null
      }
      return [
        { label: 'Line 10', value: s1.partI.line10_total },
        { label: 'Line 26', value: s1.partII.line26_totalAdjustments },
      ]
    },
  },
  'sch-2': {
    id: 'sch-2',
    label: 'Schedule 2 — Additional Taxes',
    shortLabel: 'Sch 2',
    formNumber: '2',
    keywords: ['schedule 2', 'additional taxes', 'AMT', 'self-employment tax', 'NIIT', 'additional medicare'],
    category: 'Schedule',
    presentation: 'column',
    component: Schedule2Adapter,
    keyAmounts: (state) => {
      const s2 = state.taxReturn.schedule2
      if (!s2) {
        return null
      }
      return [{ label: 'Total', value: s2.totalAdditionalTaxes }]
    },
  },
  'sch-a': {
    id: 'sch-a',
    label: 'Schedule A — Itemized Deductions',
    shortLabel: 'Sch A',
    formNumber: 'A',
    keywords: ['schedule A', 'itemized', 'deductions', 'SALT', 'mortgage interest', 'charitable'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleAAdapter,
    keyAmounts: (state) => {
      const sA = state.taxReturn.scheduleA
      if (!sA) {
        return null
      }
      return [{ label: 'Itemized', value: sA.totalItemizedDeductions }]
    },
  },
  'sch-b': {
    id: 'sch-b',
    label: 'Schedule B — Interest & Ordinary Dividends',
    shortLabel: 'Sch B',
    formNumber: 'B',
    keywords: ['schedule B', 'interest', 'dividends', '1099-INT', '1099-DIV'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleBAdapter,
    keyAmounts: (state) => {
      const sB = state.taxReturn.scheduleB
      if (!sB) {
        return null
      }
      return [
        { label: 'Int', value: sB.interestTotal },
        { label: 'Div', value: sB.dividendTotal },
      ]
    },
    xlsx: {
      sheetName: () => 'Schedule B',
      order: 25,
      build: buildScheduleBSheet,
    },
  },
  'sch-d': {
    id: 'sch-d',
    label: 'Schedule D — Capital Gains & Losses',
    shortLabel: 'Sch D',
    formNumber: 'D',
    keywords: ['schedule D', 'capital gains', 'capital losses', '1099-B', 'short-term', 'long-term'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleDAdapter,
    keyAmounts: (state) => {
      const sD = state.taxReturn.scheduleD
      if (!sD) {
        return null
      }
      return [{ label: 'Net G/L', value: sD.schD_line16 }]
    },
    xlsx: {
      sheetName: () => 'Schedule D',
      order: 40,
      build: buildScheduleDSheet,
    },
  },
  'sch-e': {
    id: 'sch-e',
    label: 'Schedule E — Supplemental Income (Rental, K-1)',
    shortLabel: 'Sch E',
    formNumber: 'E',
    keywords: ['schedule E', 'rental', 'royalties', 'K-1', 'partnership', 'S-corp', 'passthrough'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleEAdapter,
    keyAmounts: (state) => {
      const sE = state.taxReturn.scheduleE
      if (!sE) {
        return null
      }
      return [{ label: 'Total', value: sE.grandTotal }]
    },
    xlsx: {
      sheetName: () => 'Schedule E',
      order: 50,
      build: buildScheduleESheet,
    },
  },
  'sch-f': {
    id: 'sch-f',
    label: 'Schedule F — Profit or Loss From Farming',
    shortLabel: 'Sch F',
    formNumber: 'F',
    keywords: ['schedule F', 'farm', 'farming', 'agriculture', 'livestock', '1099-PATR'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleFAdapter,
    hasData: (state) => state.taxReturn.scheduleF?.hasActivity ?? false,
  },
  'sch-se': {
    id: 'sch-se',
    label: 'Schedule SE — Self-Employment Tax',
    shortLabel: 'Sch SE',
    formNumber: 'SE',
    keywords: ['schedule SE', 'self-employment', 'SE tax', 'social security', 'medicare'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleSEAdapter,
    relatedForms: ['sch-c', 'sch-1', 'sch-2'],
    keyAmounts: (state) => {
      const sse = state.taxReturn.scheduleSE
      if (!sse) {
        return null
      }
      return [{ label: 'SE Tax', value: sse.seTax }]
    },
    xlsx: {
      sheetName: () => 'Schedule SE',
      order: 60,
      build: buildScheduleSESheet,
    },
  },
  'form-4952': {
    id: 'form-4952',
    label: 'Form 4952 — Investment Interest Expense Deduction',
    shortLabel: '4952',
    formNumber: '4952',
    keywords: ['4952', 'investment interest', 'margin interest', 'short dividends'],
    category: 'Form',
    presentation: 'column',
    component: Form4952Adapter,
    xlsx: {
      sheetName: () => 'Form 4952',
      order: 80,
      build: buildForm4952Sheet,
    },
  },
  'form-6251': {
    id: 'form-6251',
    label: 'Form 6251 — Alternative Minimum Tax',
    shortLabel: '6251',
    formNumber: '6251',
    keywords: ['6251', 'AMT', 'alternative minimum tax', 'AMTI'],
    category: 'Form',
    presentation: 'column',
    component: Form6251Adapter,
    keyAmounts: (state) => {
      const f6251 = state.taxReturn.form6251
      if (!f6251) {
        return null
      }
      return [{ label: 'AMT', value: f6251.amt }]
    },
    xlsx: {
      sheetName: () => 'Form 6251',
      order: 90,
      build: buildForm6251Sheet,
    },
  },
  'form-8995': {
    id: 'form-8995',
    label: 'Form 8995 — Qualified Business Income Deduction',
    shortLabel: '8995',
    formNumber: '8995',
    keywords: ['8995', 'QBI', 'qualified business income', '199A', 'pass-through deduction'],
    category: 'Form',
    presentation: 'column',
    component: Form8995Adapter,
    keyAmounts: (state) => {
      const f8995 = state.taxReturn.form8995
      if (!f8995) {
        return null
      }
      return [{ label: 'QBI Ded.', value: f8995.estimatedDeduction }]
    },
    xlsx: {
      sheetName: () => 'Form 8995',
      order: 110,
      build: buildForm8995Sheet,
    },
  },
  // Stub adapters — pending full migration. Render placeholder cards so
  // drill-down navigation doesn't crash from missing registry entries.
  'sch-3': {
    id: 'sch-3',
    label: 'Schedule 3 — Additional Credits & Payments',
    shortLabel: 'Sch 3',
    formNumber: '3',
    keywords: ['schedule 3', 'credits', 'payments', 'nonrefundable', 'refundable'],
    category: 'Schedule',
    presentation: 'column',
    component: Schedule3Adapter,
    hasData: (state) => {
      const f1116 = state.taxReturn.form1116
      return f1116 != null && (f1116.totalForeignTaxes > 0 || f1116.totalPassiveIncome > 0)
    },
  },
  'sch-c': {
    id: 'sch-c',
    label: 'Schedule C — Profit or Loss from Business',
    shortLabel: 'Sch C',
    formNumber: 'C',
    keywords: ['schedule C', 'sole proprietor', 'business', 'self-employed', '1099-NEC'],
    category: 'Schedule',
    presentation: 'column',
    component: ScheduleCAdapter,
    hasData: (state) =>
      (state.scheduleCData?.years ?? []).some(
        (y) => y.year === state.year && y.entities.length > 0,
      ),
    xlsx: {
      sheetName: () => 'Schedule C',
      order: 30,
      build: buildScheduleCSheet,
    },
  },
  'form-1116': {
    id: 'form-1116',
    label: 'Form 1116 — Foreign Tax Credit',
    shortLabel: '1116',
    formNumber: '1116',
    keywords: ['1116', 'FTC', 'foreign tax credit', 'foreign income', 'passive', 'general'],
    category: 'Form',
    presentation: 'column',
    component: Form1116Adapter,
    keyAmounts: (state) => {
      const f1116 = state.taxReturn.form1116
      if (!f1116) {
        return null
      }
      return [{ label: 'FTC', value: f1116.totalForeignTaxes }]
    },
    instances: {
      list: (state) => {
        const f1116 = state.taxReturn.form1116
        if (!f1116) {
          return []
        }
        const list: { key: string; label: string }[] = []
        // Passive is always present whenever Form 1116 exists.
        list.push({ key: 'passive', label: 'Passive' })
        // General only present when K-3 detection found general-category income.
        if (f1116.totalGeneralIncome > 0) {
          list.push({ key: 'general', label: 'General' })
        }
        return list
      },
      // IRS categories are an enum, not user-created. Use 'passive' as the
      // sensible default if the create button is ever surfaced.
      create: () => ({ key: 'passive', label: 'Passive' }),
      allowCreate: false,
    },
    xlsx: {
      sheetName: () => 'Form 1116',
      order: 85,
      build: buildForm1116Sheet,
    },
  },
  'form-8582': {
    id: 'form-8582',
    label: 'Form 8582 — Passive Activity Loss Limitations',
    shortLabel: '8582',
    formNumber: '8582',
    keywords: ['8582', 'PAL', 'passive activity', 'loss limitation', 'real estate professional'],
    category: 'Form',
    presentation: 'column',
    component: Form8582Adapter,
    keyAmounts: (state) => {
      const f8582 = state.taxReturn.form8582
      if (!f8582 || f8582.activities.length === 0) {
        return null
      }
      return [{ label: 'Net', value: f8582.netPassiveResult }]
    },
    xlsx: {
      sheetName: () => 'Form 8582',
      order: 100,
      build: buildForm8582Sheet,
    },
  },
  'form-4797': {
    id: 'form-4797',
    label: 'Form 4797 — Sales of Business Property',
    shortLabel: '4797',
    formNumber: '4797',
    keywords: ['4797', 'business property', 'section 1231', 'depreciation recapture'],
    category: 'Form',
    presentation: 'column',
    component: Form4797Adapter,
    hasData: (state) => state.taxReturn.form4797?.hasActivity ?? false,
  },
  'form-8606': {
    id: 'form-8606',
    label: 'Form 8606 — Nondeductible IRAs',
    shortLabel: '8606',
    formNumber: '8606',
    keywords: ['8606', 'nondeductible IRA', 'IRA basis', 'backdoor Roth'],
    category: 'Form',
    presentation: 'column',
    component: Form8606Adapter,
    hasData: (state) => state.taxReturn.form8606?.hasActivity ?? false,
  },
  'form-8949': {
    id: 'form-8949',
    label: 'Form 8949 — Sales & Dispositions of Capital Assets',
    shortLabel: '8949',
    formNumber: '8949',
    keywords: ['8949', 'capital assets', 'wash sale', 'cost basis'],
    category: 'Form',
    presentation: 'column',
    component: Form8949Adapter,
    hasData: (state) => state.reviewed1099Docs.length > 0 || state.reviewedK1Docs.length > 0,
  },
  'action-items': {
    id: 'action-items',
    label: 'Action Items',
    shortLabel: 'Action Items',
    keywords: ['action items', 'todos', 'review queue', 'issues'],
    category: 'App',
    presentation: 'app',
    component: ActionItemsAdapter,
  },
  estimate: {
    id: 'estimate',
    label: 'Tax Estimate',
    shortLabel: 'Estimate',
    keywords: ['estimate', 'refund', 'tax due', 'safe harbor', 'estimated payments', 'brackets'],
    category: 'App',
    presentation: 'app',
    component: EstimateAdapter,
    xlsx: {
      sheetName: () => 'Est. Tax Payments',
      order: 200,
      build: buildEstimatedTaxSheet,
    },
  },
  documents: {
    id: 'documents',
    label: 'Account Documents',
    shortLabel: 'Documents',
    keywords: ['documents', 'upload', '1099', 'W-2', 'K-1', 'account documents'],
    category: 'App',
    presentation: 'app',
    component: DocumentsAdapter,
    wide: true,
  },
  'wks-se-401k': {
    id: 'wks-se-401k',
    label: 'SE 401(k) Contribution Worksheet',
    shortLabel: 'SE 401(k)',
    keywords: ['401k', 'self-employed retirement', 'solo 401k', 'employer contribution'],
    category: 'Worksheet',
    presentation: 'modal',
    component: WorksheetSE401k,
    relatedForms: ['sch-c', 'sch-se', 'sch-1'],
  },
  'wks-amt-exemption': {
    id: 'wks-amt-exemption',
    label: 'AMT Exemption Phaseout Worksheet',
    shortLabel: 'AMT Exemption',
    keywords: ['AMT', 'AMT exemption', 'phaseout', 'alternative minimum tax exemption'],
    category: 'Worksheet',
    presentation: 'modal',
    component: WorksheetAmtExemption,
    relatedForms: ['form-6251'],
  },
  'wks-taxable-ss': {
    id: 'wks-taxable-ss',
    label: 'Taxable Social Security Worksheet',
    shortLabel: 'Taxable SS',
    keywords: ['social security', 'taxable social security', 'SSA-1099'],
    category: 'Worksheet',
    presentation: 'modal',
    component: WorksheetTaxableSS,
    relatedForms: ['form-1040'],
  },
  'wks-1116-apportionment': {
    id: 'wks-1116-apportionment',
    label: 'Form 1116 Apportionment Worksheet',
    shortLabel: '1116 Wks',
    keywords: ['1116 worksheet', 'apportionment', 'interest expense', 'asset method', 'line 4b'],
    category: 'Worksheet',
    presentation: 'column',
    component: Worksheet1116Adapter,
    relatedForms: ['form-1116'],
  },
}
