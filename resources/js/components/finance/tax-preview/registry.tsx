import Form1040Preview from '@/components/finance/Form1040Preview'
import Schedule1Preview from '@/components/finance/Schedule1Preview'

import type { FormRegistry, FormRenderProps } from './formRegistry'

function Form1040Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Form1040Preview lines={state.taxReturn.form1040 ?? []} selectedYear={state.year} />
}

function Schedule1Adapter({ state }: FormRenderProps): React.ReactElement {
  return <Schedule1Preview selectedYear={state.year} schedule1={state.taxReturn.schedule1} />
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
}
