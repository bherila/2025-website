
import currency from 'currency.js'
import { useState } from 'react'

import ActionItemsTab from '@/components/finance/ActionItemsTab'
import AdditionalTaxesPreview from '@/components/finance/AdditionalTaxesPreview'
import CapitalGainsReconciliationPanel from '@/components/finance/CapitalGainsReconciliationPanel'
import Form1040Preview from '@/components/finance/Form1040Preview'
import Form1116Preview from '@/components/finance/Form1116Preview'
import Form4797Preview from '@/components/finance/Form4797Preview'
import Form4952Preview from '@/components/finance/Form4952Preview'
import Form6251Preview from '@/components/finance/Form6251Preview'
import Form8582Preview from '@/components/finance/Form8582Preview'
import Form8606Preview from '@/components/finance/Form8606Preview'
import Form8949Preview from '@/components/finance/Form8949Preview'
import Form8995Preview from '@/components/finance/Form8995Preview'
import PayslipDataSourceModal from '@/components/finance/PayslipDataSourceModal'
import Schedule1Preview from '@/components/finance/Schedule1Preview'
import Schedule3Preview from '@/components/finance/Schedule3Preview'
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
import TaxLotReconciliationPanel from '@/components/finance/TaxLotReconciliationPanel'
import WorksheetAmtExemption from '@/components/finance/worksheets/WorksheetAmtExemption'
import WorksheetSE401k from '@/components/finance/worksheets/WorksheetSE401k'
import WorksheetTaxableSS from '@/components/finance/worksheets/WorksheetTaxableSS'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import WorksheetColumn1116 from '@/finance/1116/WorksheetColumn'
import { buildCapitalGainsReportFromTaxDocuments } from '@/lib/finance/capitalGainsReporting'

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
      facts={state.taxFacts?.form1040}
      selectedYear={state.year}
      onNavigate={tabToDrill(onDrill)}
    />
  )
}

function Schedule1Adapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  const { openTaxDocumentDetail } = useDockActions()
  return (
    <Schedule1Preview
      selectedYear={state.year}
      onTabChange={tabToDrill(onDrill)}
      taxFacts={state.taxFacts?.schedule1 ?? null}
      onOpenDoc={openTaxDocumentDetail}
    />
  )
}

function Schedule2Adapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  return (
    <AdditionalTaxesPreview
      taxFacts={state.taxFacts}
      isMarried={state.isMarried}
      form8959={state.form8959}
      capitalLossCarryover={state.capitalLossCarryover}
      form461={state.form461}
      onTabChange={tabToDrill(onDrill)}
    />
  )
}

function ScheduleAAdapter({ state }: FormRenderProps): React.ReactElement {
  const { openTaxDocumentDetail } = useDockActions()
  return (
    <ScheduleAPreview
      selectedYear={state.year}
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      isMarried={state.isMarried}
      userDeductions={state.userDeductions}
      form4952Facts={state.taxFacts?.form4952 ?? null}
      scheduleAFacts={state.taxFacts?.scheduleA ?? null}
      onOpenDoc={openTaxDocumentDetail}
      {...(state.shortDividendSummary ? { shortDividendSummary: state.shortDividendSummary } : {})}
    />
  )
}

function ScheduleBAdapter({ state }: FormRenderProps): React.ReactElement {
  const { reviewK1Doc } = useDockActions()
  return (
    <ScheduleBPreview
      taxFacts={state.taxFacts?.scheduleB ?? null}
      selectedYear={state.year}
      onOpenDoc={reviewK1Doc}
    />
  )
}

function ScheduleDAdapter({ state, onDrill }: FormRenderProps): React.ReactElement {
  const { openTaxDocumentDetail } = useDockActions()
  return (
    <ScheduleDPreview
      reviewedK1Docs={state.reviewedK1Docs}
      reviewed1099Docs={state.reviewed1099Docs}
      selectedYear={state.year}
      priorYearCapitalLossCarryover={state.priorYearCapitalLossCarryover}
      onOpenDoc={openTaxDocumentDetail}
      onGoToForm1040={() => onDrill({ form: 'form-1040', placement: 'left-of-current' })}
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
      taxFacts={state.taxFacts?.scheduleSE ?? null}
      reviewedK1Docs={state.reviewedK1Docs}
      selectedYear={state.year}
      isMarried={state.isMarried}
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
      form4952Facts={state.taxFacts?.form4952 ?? null}
      {...(state.shortDividendSummary
        ? { shortDividendDeduction: state.shortDividendSummary.totalItemizedDeduction }
        : {})}
    />
  )
}

function Form6251Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Form6251Preview form6251={state.taxFacts?.form6251} selectedYear={state.year} />
}

function Form8995Adapter({ state }: FormRenderProps): React.ReactElement {
  return (
    <Form8995Preview
      taxFacts={state.taxFacts?.form8995 ?? null}
      selectedYear={state.year}
      isMarried={state.isMarried}
    />
  )
}

function Form8582Adapter({ state }: FormRenderProps): React.ReactElement {
  const facts = state.taxFacts?.form8582
  if (!facts) {
    return (
      <StubCard
        title="Form 8582 — Passive Activity Loss Limitations"
        note="No passive activity data available. Add a Schedule E rental property or a K-1 with passive losses to populate this form."
      />
    )
  }
  return (
    <Form8582Preview
      form8582={facts}
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
  const facts = state.taxFacts?.schedule3
  if (!facts) {
    return (
      <StubCard
        title="Schedule 3 — Additional Credits & Payments"
        note="Schedule 3 facts are not loaded yet."
      />
    )
  }

  return <Schedule3Preview facts={facts} selectedYear={state.year} />
}

function Form1116Adapter({ state, instance, onDrill }: FormRenderProps): React.ReactElement {
  const { reviewK1Doc, bulkSetSbpElection } = useDockActions()
  const facts = state.taxFacts?.form1116
  if (!facts) {
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
      form1116={facts}
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
      taxFacts={state.taxFacts?.scheduleC ?? null}
    />
  )
}

function Form4797Adapter({ state }: FormRenderProps): React.ReactElement {
  const facts = state.taxFacts?.form4797
  if (!facts) {
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
      form4797={facts}
    />
  )
}

function ScheduleFAdapter({ state }: FormRenderProps): React.ReactElement {
  const facts = state.taxFacts?.scheduleF
  if (!facts) {
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
      scheduleF={facts}
    />
  )
}

function Form8606Adapter({ state }: FormRenderProps): React.ReactElement {
  const facts = state.taxFacts?.form8606
  if (!facts) {
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
      form8606={facts}
    />
  )
}

function Form8949Adapter({ state, instance }: FormRenderProps): React.ReactElement {
  const accountId = instance?.key !== undefined && instance.key !== 'all' ? Number(instance.key) : undefined
  const accountFilter = typeof accountId === 'number' && Number.isFinite(accountId) ? { accountId } : {}
  return (
    <Form8949Preview
      selectedYear={state.year}
      reviewed1099Docs={state.reviewed1099Docs}
      {...accountFilter}
    />
  )
}

function form8949Instances(state: FormRenderProps['state']): { key: string; label: string }[] {
  const accountIds = new Set<number>()

  for (const doc of state.reviewed1099Docs) {
    if ((doc.form_type === '1099_b' || doc.form_type === '1099_b_c') && doc.account_id !== null) {
      accountIds.add(doc.account_id)
      continue
    }

    if (doc.form_type !== 'broker_1099') {
      continue
    }

    for (const link of doc.account_links ?? []) {
      if ((link.form_type === '1099_b' || link.form_type === '1099_b_c') && link.account_id !== null) {
        accountIds.add(link.account_id)
      }
    }
  }

  return [
    { key: 'all', label: 'All' },
    ...state.accounts
      .filter((account) => accountIds.has(account.acct_id))
      .map((account) => ({ key: String(account.acct_id), label: account.acct_name })),
  ]
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
    taxFacts: state.taxFacts,
    accountDocuments: state.accountDocuments,
    w2Documents: state.w2Documents,
    payslips: state.payslips,
  })
  return <TaxEstimateFullDetail summary={summary} />
}

function W2IncomeSummaryAdapter({ state }: FormRenderProps): React.ReactElement {
  return <W2IncomeSummary payslips={state.payslips} />
}

/**
 * W-2 income summary table derived from payslip rows.
 *
 * Rows are clickable when they correspond to a computed value and open a data-source modal
 * that shows the per-payslip contributions.
 */
function W2IncomeSummary({ payslips }: { payslips: fin_payslip[] }): React.ReactElement {
  const [dataSourceRow, setDataSourceRow] = useState<{
    label: string
    getter: (p: fin_payslip) => currency
  } | null>(null)

  if (payslips.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-muted p-3 text-sm text-muted-foreground">
        No W-2 payslip data for this year yet.
      </div>
    )
  }

  const sum = (fn: (row: fin_payslip) => currency) => payslips.reduce((acc, row) => acc.add(fn(row)), currency(0))
  const wagesGetter = (r: fin_payslip) => currency(r.ps_salary ?? 0)
  const bonusGetter = (r: fin_payslip) => currency(r.earnings_bonus ?? 0)
  const rsuGetter = (r: fin_payslip) => currency(r.earnings_rsu ?? 0)
  const vacationGetter = (r: fin_payslip) => currency(r.ps_vacation_payout ?? 0)
  const imputedGetter = (r: fin_payslip) =>
    currency(r.imp_ltd ?? 0)
      .add(r.imp_legal ?? 0)
      .add(r.imp_fitness ?? 0)
      .add(r.imp_other ?? 0)
  const pretaxDeductionsGetter = (r: fin_payslip) =>
    currency(r.ps_401k_pretax ?? 0)
      .add(r.ps_pretax_medical ?? 0)
      .add(r.ps_pretax_dental ?? 0)
      .add(r.ps_pretax_vision ?? 0)
      .add(r.ps_pretax_fsa ?? 0)
  const fedWHGetter = (r: fin_payslip) =>
    currency(r.ps_fed_tax ?? 0).add(r.ps_fed_tax_addl ?? 0).subtract(r.ps_fed_tax_refunded ?? 0)
  const stateWHGetter = (r: fin_payslip) =>
    currency((r.state_data?.[0]?.state_tax as number) ?? 0).add((r.state_data?.[0]?.state_tax_addl as number) ?? 0)
  const oasdiGetter = (r: fin_payslip) => currency(r.ps_oasdi ?? 0)
  const medicareGetter = (r: fin_payslip) => currency(r.ps_medicare ?? 0)
  const sdiGetter = (r: fin_payslip) => currency((r.state_data?.[0]?.state_disability as number) ?? 0)

  const wages = sum(wagesGetter)
  const bonus = sum(bonusGetter)
  const rsu = sum(rsuGetter)
  const vacationPayout = sum(vacationGetter)
  const imputed = sum(imputedGetter)
  const pretaxDeductions = sum(pretaxDeductionsGetter)
  const gross = wages
    .add(bonus)
    .add(rsu)
    .add(vacationPayout)
    .add(imputed)
    .subtract(pretaxDeductions)
  const fedWH = sum(fedWHGetter)
  const stateWH = sum(stateWHGetter)
  const oasdi = sum(oasdiGetter)
  const medicare = sum(medicareGetter)
  const sdi = sum(sdiGetter)

  const grossGetter = (r: fin_payslip) =>
    wagesGetter(r).add(bonusGetter(r)).add(rsuGetter(r)).add(vacationGetter(r)).add(imputedGetter(r)).subtract(pretaxDeductionsGetter(r))

  const rows = [
    { label: 'Wages / Salary', value: wages, getter: wagesGetter },
    bonus.value > 0 ? { label: 'Bonus', value: bonus, getter: bonusGetter } : null,
    rsu.value > 0 ? { label: 'RSU Vesting', value: rsu, getter: rsuGetter } : null,
    vacationPayout.value > 0 ? { label: 'Vacation Payout', value: vacationPayout, getter: vacationGetter } : null,
    imputed.value > 0 ? { label: 'Imputed Income (benefits)', value: imputed, getter: imputedGetter } : null,
    pretaxDeductions.value > 0
      ? { label: 'Pre-tax Deductions (401k, benefits)', value: pretaxDeductions.multiply(-1), getter: (r: fin_payslip) => pretaxDeductionsGetter(r).multiply(-1) }
      : null,
    { label: 'Total Gross W-2 Income (Box 1)', value: gross, bold: true, getter: grossGetter },
    { label: '', value: null, getter: null },
    { label: 'Federal Income Tax Withheld', value: fedWH, getter: fedWHGetter },
    { label: 'State Income Tax Withheld', value: stateWH, getter: stateWHGetter },
    { label: 'OASDI / Social Security Tax', value: oasdi, getter: oasdiGetter },
    { label: 'Medicare Tax', value: medicare, getter: medicareGetter },
    sdi.value > 0 ? { label: 'State Disability Insurance (SDI)', value: sdi, getter: sdiGetter } : null,
  ].filter(Boolean) as {
    label: string
    value: currency | null
    bold?: boolean
    getter: ((p: fin_payslip) => currency) | null
  }[]

  return (
    <>
      <div>
        <h2 className="text-lg font-semibold mb-2">W-2 Income Summary</h2>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line Item</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) =>
                row.label === '' ? (
                  <TableRow key={i} className="border-t-2">
                    <TableCell colSpan={2} className="py-0 h-px bg-muted/30" />
                  </TableRow>
                ) : (
                  <TableRow key={i} className={row.bold ? 'font-semibold bg-muted/30' : ''}>
                    <TableCell className="text-sm">{row.label}</TableCell>
                    <TableCell className="text-right text-sm font-mono">
                      {row.value !== null && row.getter ? (
                        <button
                          type="button"
                          className="underline decoration-dotted cursor-pointer hover:text-primary"
                          onClick={() => setDataSourceRow({ label: row.label, getter: row.getter! })}
                          title="View data sources"
                        >
                          {row.value.format()}
                        </button>
                      ) : row.value !== null ? (
                        row.value.format()
                      ) : (
                        ''
                      )}
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {dataSourceRow && (
        <PayslipDataSourceModal
          open
          label={dataSourceRow.label}
          payslips={payslips}
          valueGetter={dataSourceRow.getter}
          onClose={() => setDataSourceRow(null)}
        />
      )}
    </>
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
        onDocumentsListChange={state.setAccountDocuments}
        onTaxFactsChange={state.setTaxFacts}
      />
    </div>
  )
}

function TaxLotReconciliationAdapter({ state }: FormRenderProps): React.ReactElement {
  return <TaxLotReconciliationPanel selectedYear={state.year} />
}

function CapitalGainsReconciliationAdapter({ state }: FormRenderProps): React.ReactElement {
  return <CapitalGainsReconciliationPanel selectedYear={state.year} />
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
    keyAmounts: (state) => {
      const s1 = state.taxFacts?.schedule1
      if (!s1) {
        return null
      }
      return [
        {
          label: 'Line 10',
          value: currency(s1.line1aTotal)
            .add(s1.line2aTotal)
            .add(s1.line3Total)
            .add(s1.line4Total)
            .add(s1.line5Total)
            .add(s1.line6Total)
            .add(s1.line7Total)
            .add(s1.line9TotalOtherIncome).value,
        },
        { label: 'Line 26', value: s1.line15Total },
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
      const facts = state.taxFacts
      if (!facts) {
        return null
      }
      return [{ label: 'Total', value: facts.form1040.line23 }]
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
      const sA = state.taxFacts?.scheduleA
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
      const sB = state.taxFacts?.scheduleB
      if (!sB) {
        return null
      }
      return [
        { label: 'Int', value: sB.interestTotal },
        { label: 'Div', value: sB.ordinaryDividendTotal },
      ]
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
      const sD = state.taxFacts?.scheduleD
      if (!sD) {
        return null
      }
      return [{ label: 'Net G/L', value: sD.line16Combined }]
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
      const sE = state.taxFacts?.scheduleE
      if (!sE) {
        return null
      }
      return [{ label: 'Total', value: sE.grandTotal }]
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
    hasData: (state) => state.taxFacts?.scheduleF.hasActivity ?? false,
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
      const sse = state.taxFacts?.scheduleSE
      if (!sse) {
        return null
      }
      return [{ label: 'SE Tax', value: sse.seTax }]
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
      const f6251 = state.taxFacts?.form6251
      if (!f6251) {
        return null
      }
      return [{ label: 'AMT', value: f6251.amt }]
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
      const f8995 = state.taxFacts?.form8995
      if (!f8995) {
        return null
      }
      return [{ label: 'QBI Ded.', value: f8995.deduction }]
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
      const s3 = state.taxFacts?.schedule3
      return s3 != null && (s3.line8TotalNonrefundableCredits > 0 || s3.line15TotalPaymentsRefundableCredits > 0)
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
      const f1116 = state.taxFacts?.form1116
      if (!f1116) {
        return null
      }
      return [{ label: 'FTC', value: f1116.totalForeignTaxes }]
    },
    instances: {
      list: (state) => {
        const f1116 = state.taxFacts?.form1116
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
    keyAmounts: (state) => {
      const f8582 = state.taxFacts?.form8582
      if (!f8582 || f8582.activities.length === 0) {
        return null
      }
      return [{ label: 'Net', value: f8582.netPassiveResult }]
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
    hasData: (state) => state.taxFacts?.form4797.hasActivity ?? false,
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
    hasData: (state) => state.taxFacts?.form8606.hasActivity ?? false,
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
    instances: {
      list: form8949Instances,
      create: () => ({ key: 'all', label: 'All' }),
      allowCreate: false,
    },
    hasData: (state) => buildCapitalGainsReportFromTaxDocuments(state.reviewed1099Docs).form8949Lots.length > 0,
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
    wide: true,
  },
  'w2-summary': {
    id: 'w2-summary',
    label: 'W-2 Income Summary',
    shortLabel: 'W-2 Summary',
    keywords: ['W-2', 'payroll', 'gross income', 'withholding', 'wages', 'taxes withheld'],
    category: 'Worksheet',
    presentation: 'modal',
    component: W2IncomeSummaryAdapter,
    hasData: (state) => state.payslips.length > 0,
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
  'tax-lot-reconciliation': {
    id: 'tax-lot-reconciliation',
    label: '1099-B Lot Reconciliation',
    shortLabel: '1099-B Reconcile',
    keywords: ['1099-B', 'broker lots', 'tax lots', 'reconciliation', 'Form 8949'],
    category: 'App',
    presentation: 'app',
    component: TaxLotReconciliationAdapter,
    wide: true,
  },
  'capital-gains-reconciliation': {
    id: 'capital-gains-reconciliation',
    label: 'Capital Gains Reconciliation',
    shortLabel: 'Cap. Gains Recon.',
    keywords: [
      'capital gains', 'reconciliation', '1099-B', 'wash sale', 'cross-account',
      'Form 8949', 'Schedule D', 'lot reconciliation', 'adjustments',
    ],
    category: 'App',
    presentation: 'app',
    component: CapitalGainsReconciliationAdapter,
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
