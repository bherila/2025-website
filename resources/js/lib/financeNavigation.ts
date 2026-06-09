export type FinanceTopToolId =
  | 'tax-preview'
  | 'documents'
  | 'rsu'
  | 'payslips'
  | 'tags'
  | 'calculators'
  | 'accounts'
  | 'config'

export interface FinanceTopToolDef {
  id: FinanceTopToolId
  label: string
  href: string
  keywords: string[]
}

export type FinanceAccountToolId =
  | 'transactions'
  | 'duplicates'
  | 'linker'
  | 'statements'
  | 'lots'
  | 'summary'
  | 'fees'
  | 'import'
  | 'maintenance'

export interface FinanceAccountToolDef {
  id: FinanceAccountToolId
  label: string
  keywords: string[]
  supportsAllAccounts: boolean
  preserveYear: boolean
  visibleInNavbarTabs: boolean
}

export const FINANCE_TOP_TOOLS: FinanceTopToolDef[] = [
  { id: 'tax-preview', label: 'Tax Preview', href: '/finance/tax-preview', keywords: ['tax', 'preview', '1040', 'return'] },
  { id: 'documents', label: 'Documents', href: '/finance/documents', keywords: ['documents', 'upload', '1099', 'w2', 'w-2', 'k1', 'k-1'] },
  { id: 'rsu', label: 'RSU', href: '/finance/rsu', keywords: ['rsu', 'stock compensation', 'vesting'] },
  { id: 'payslips', label: 'Payslips', href: '/finance/payslips', keywords: ['payslips', 'payroll', 'wages', 'w2', 'w-2'] },
  { id: 'tags', label: 'Tags', href: '/finance/tags', keywords: ['tags', 'categories', 'rules'] },
  { id: 'calculators', label: 'Calculators', href: '/financial-planning', keywords: ['calculators', 'financial planning', 'retirement', 'roth'] },
  { id: 'accounts', label: 'Accounts', href: '/finance/accounts', keywords: ['accounts', 'balances'] },
  { id: 'config', label: 'Config', href: '/finance/config', keywords: ['config', 'settings'] },
]

export const FINANCE_ACCOUNT_TOOLS: FinanceAccountToolDef[] = [
  { id: 'transactions', label: 'Transactions', keywords: ['transactions', 'txns', 'line items'], supportsAllAccounts: true, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'duplicates', label: 'Duplicates', keywords: ['duplicates', 'dedupe'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'linker', label: 'Linker', keywords: ['linker', 'transfers', 'matching'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'statements', label: 'Statements', keywords: ['statements', 'balances'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'lots', label: 'Lots', keywords: ['lots', 'tax lots', 'cost basis'], supportsAllAccounts: true, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'summary', label: 'Summary', keywords: ['summary', 'overview'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'fees', label: 'Fees', keywords: ['fees', 'fee drag', 'advisory fees'], supportsAllAccounts: true, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'import', label: 'Import', keywords: ['import', 'upload transactions'], supportsAllAccounts: true, preserveYear: false, visibleInNavbarTabs: false },
  { id: 'maintenance', label: 'Maintenance', keywords: ['maintenance', 'settings'], supportsAllAccounts: false, preserveYear: false, visibleInNavbarTabs: false },
]
