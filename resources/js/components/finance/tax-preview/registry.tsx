import AdditionalTaxesPreview from '@/components/finance/AdditionalTaxesPreview'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import Form6251Preview from '@/components/finance/Form6251Preview'
import Form8995Preview from '@/components/finance/Form8995Preview'
import Schedule1Preview from '@/components/finance/Schedule1Preview'
import ScheduleAPreview from '@/components/finance/ScheduleAPreview'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import ScheduleDPreview from '@/components/finance/ScheduleDPreview'
import ScheduleEPreview from '@/components/finance/ScheduleEPreview'
import ScheduleSEPreview from '@/components/finance/ScheduleSEPreview'

import type { FormRegistry, FormRenderProps } from './formRegistry'

function Form1040Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Form1040Preview lines={state.taxReturn.form1040 ?? []} selectedYear={state.year} />
}

function Schedule1Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Schedule1Preview selectedYear={state.year} schedule1={state.taxReturn.schedule1} />
}

function Schedule2Adapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <AdditionalTaxesPreview
      schedule2={state.taxReturn.schedule2}
      scheduleSE={state.taxReturn.scheduleSE}
      form8959={state.taxReturn.form8959}
      form8960={state.taxReturn.form8960}
      capitalLossCarryover={state.taxReturn.capitalLossCarryover}
      form461={state.taxReturn.form461}
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
  return (
    <ScheduleBPreview
      interestIncome={state.income1099.interestIncome}
      dividendIncome={state.income1099.dividendIncome}
      qualifiedDividends={state.income1099.qualifiedDividends}
      selectedYear={state.year}
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
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

function ScheduleSEAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <ScheduleSEPreview
      reviewedK1Docs={state.reviewedK1Docs}
      scheduleCNetIncome={state.scheduleCNetIncome.total}
      selectedYear={state.year}
      isMarried={state.isMarried}
      reviewedW2Docs={state.reviewedW2Docs}
      payslips={state.payslips}
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

/**
 * Registry populated with the first migrated forms. Additional entries
 * land in subsequent commits as each form's adapter is written.
 */
export const formRegistry: Partial<FormRegistry> = {
  home: {
    id: 'home',
    label: 'Home',
    shortLabel: 'Home',
    keywords: ['home', 'dashboard', 'overview'],
    category: 'App',
    presentation: 'app',
    component: HomePlaceholder,
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
  },
}
