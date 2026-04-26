
import currency from 'currency.js'

import ActionItemsTab from '@/components/finance/ActionItemsTab'
import AdditionalTaxesPreview from '@/components/finance/AdditionalTaxesPreview'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form1116Preview from '@/components/finance/Form1116Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import Form6251Preview from '@/components/finance/Form6251Preview'
import Form8582Preview from '@/components/finance/Form8582Preview'
import Form8995Preview from '@/components/finance/Form8995Preview'
import Schedule1Preview from '@/components/finance/Schedule1Preview'
import Schedule3Preview, { computeSchedule3 } from '@/components/finance/Schedule3Preview'
import ScheduleAPreview from '@/components/finance/ScheduleAPreview'
import ScheduleBPreview from '@/components/finance/ScheduleBPreview'
import ScheduleCTab from '@/components/finance/ScheduleCTab'
import ScheduleDPreview from '@/components/finance/ScheduleDPreview'
import ScheduleEPreview from '@/components/finance/ScheduleEPreview'
import ScheduleSEPreview from '@/components/finance/ScheduleSEPreview'
import TaxDocuments1099Section from '@/components/finance/TaxDocuments1099Section'
import TaxDocumentsSection from '@/components/finance/TaxDocumentsSection'
import {
  buildForm8582Sheet,
  buildScheduleCSheet,
  buildScheduleDSheet,
  buildScheduleESheet,
} from '@/lib/finance/buildTaxWorkbook'

import { useDockActions } from './DockActions'
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

function Form1116Adapter({ state, instance }: FormRenderProps): React.ReactElement {
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
      {...(category ? { category } : {})}
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

function Form4797Stub(): React.ReactElement {
  return (
    <StubCard
      title="Form 4797 — Sales of Business Property"
      note="Form 4797 doesn't exist in the codebase yet. Tracked in #319."
    />
  )
}

function ScheduleFStub(): React.ReactElement {
  return (
    <StubCard
      title="Schedule F — Profit or Loss From Farming"
      note="Schedule F doesn't exist in the codebase yet. Tracked in #320. Note: not currently wired to a FormId — placeholder reserved."
    />
  )
}

function Form8606Stub(): React.ReactElement {
  return <StubCard title="Form 8606 — Nondeductible IRAs" note="Pending migration." />
}

function Form8949Stub(): React.ReactElement {
  return (
    <StubCard
      title="Form 8949 — Sales & Dispositions of Capital Assets"
      note="Pending migration. Currently rendered inside Schedule D."
    />
  )
}

function ActionItemsAdapter({ state }: FormRenderProps): React.ReactElement {
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
    />
  )
}

function EstimateStub(): React.ReactElement {
  return (
    <StubCard
      title="Tax Estimate"
      note="Will move into the persistent header (3 tiers: slim / expanded cards / full modal with brackets + safe-harbor planning)."
    />
  )
}

function DocumentsAdapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <TaxDocumentsSection
        selectedYear={state.year}
        payslips={state.payslips}
        documents={state.w2Documents}
        employmentEntities={state.employmentEntities}
      />
      <TaxDocuments1099Section
        selectedYear={state.year}
        documents={state.accountDocuments}
        accounts={state.accounts}
        activeAccountIds={state.activeAccountIds}
        foreignTaxSummaries={state.foreignTaxSummaries}
      />
    </div>
  )
}

function WorksheetSE401kStub(): React.ReactElement {
  return (
    <StubCard
      title="SE 401(k) Contribution Worksheet"
      note="Worksheet — will open as a modal Dialog, not a column. Pulls from Schedule SE net earnings + Schedule C compensation."
    />
  )
}

function WorksheetAmtStub(): React.ReactElement {
  return <StubCard title="AMT Exemption Phaseout Worksheet" note="Worksheet — will open as a modal." />
}

function WorksheetTaxableSsStub(): React.ReactElement {
  return <StubCard title="Taxable Social Security Worksheet" note="Worksheet — will open as a modal." />
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
    xlsx: {
      sheetName: () => 'Schedule E',
      order: 50,
      build: buildScheduleESheet,
    },
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
    component: Form4797Stub,
  },
  'form-8606': {
    id: 'form-8606',
    label: 'Form 8606 — Nondeductible IRAs',
    shortLabel: '8606',
    formNumber: '8606',
    keywords: ['8606', 'nondeductible IRA', 'IRA basis', 'backdoor Roth'],
    category: 'Form',
    presentation: 'column',
    component: Form8606Stub,
  },
  'form-8949': {
    id: 'form-8949',
    label: 'Form 8949 — Sales & Dispositions of Capital Assets',
    shortLabel: '8949',
    formNumber: '8949',
    keywords: ['8949', 'capital assets', 'wash sale', 'cost basis'],
    category: 'Form',
    presentation: 'column',
    component: Form8949Stub,
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
    component: EstimateStub,
  },
  documents: {
    id: 'documents',
    label: 'Account Documents',
    shortLabel: 'Documents',
    keywords: ['documents', 'upload', '1099', 'W-2', 'K-1', 'account documents'],
    category: 'App',
    presentation: 'app',
    component: DocumentsAdapter,
  },
  'wks-se-401k': {
    id: 'wks-se-401k',
    label: 'SE 401(k) Contribution Worksheet',
    shortLabel: 'SE 401(k)',
    keywords: ['401k', 'self-employed retirement', 'solo 401k', 'employer contribution'],
    category: 'Worksheet',
    presentation: 'modal',
    component: WorksheetSE401kStub,
    relatedForms: ['sch-c', 'sch-se', 'sch-1'],
  },
  'wks-amt-exemption': {
    id: 'wks-amt-exemption',
    label: 'AMT Exemption Phaseout Worksheet',
    shortLabel: 'AMT Exemption',
    keywords: ['AMT', 'AMT exemption', 'phaseout', 'alternative minimum tax exemption'],
    category: 'Worksheet',
    presentation: 'modal',
    component: WorksheetAmtStub,
    relatedForms: ['form-6251'],
  },
  'wks-taxable-ss': {
    id: 'wks-taxable-ss',
    label: 'Taxable Social Security Worksheet',
    shortLabel: 'Taxable SS',
    keywords: ['social security', 'taxable social security', 'SSA-1099'],
    category: 'Worksheet',
    presentation: 'modal',
    component: WorksheetTaxableSsStub,
    relatedForms: ['form-1040'],
  },
}
