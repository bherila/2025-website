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
  permission?: string
}

export type FinanceAccountToolId =
  | 'transactions'
  | 'duplicates'
  | 'linker'
  | 'statements'
  | 'lots'
  | 'summary'
  | 'fees'
  | 'basis'
  | 'import'
  | 'maintenance'

export interface FinanceAccountToolDef {
  id: FinanceAccountToolId
  label: string
  keywords: string[]
  supportsAllAccounts: boolean
  preserveYear: boolean
  visibleInNavbarTabs: boolean
  permission: string
}

export const FINANCE_TOP_TOOLS: FinanceTopToolDef[] = [
  { id: 'tax-preview', label: 'Tax Preview', href: '/finance/tax-preview', permission: 'finance.tax-preview.view', keywords: ['tax', 'preview', '1040', 'return'] },
  { id: 'documents', label: 'Documents', href: '/finance/documents', permission: 'finance.tax-documents.view', keywords: ['documents', 'upload', '1099', 'w2', 'w-2', 'k1', 'k-1'] },
  { id: 'rsu', label: 'RSU', href: '/finance/rsu', permission: 'finance.rsu.view', keywords: ['rsu', 'stock compensation', 'vesting'] },
  { id: 'payslips', label: 'Payslips', href: '/finance/payslips', permission: 'finance.payslips.view', keywords: ['payslips', 'payroll', 'wages', 'w2', 'w-2'] },
  { id: 'tags', label: 'Tags', href: '/finance/tags', permission: 'finance.rules.manage', keywords: ['tags', 'categories', 'rules'] },
  { id: 'calculators', label: 'Calculators', href: '/financial-planning', keywords: ['calculators', 'financial planning', 'retirement', 'roth'] },
  { id: 'accounts', label: 'Accounts', href: '/finance/accounts', permission: 'finance.accounts.detail', keywords: ['accounts', 'balances'] },
  { id: 'config', label: 'Config', href: '/finance/config', permission: 'finance.config.manage', keywords: ['config', 'settings'] },
]

export const FINANCE_ACCOUNT_TOOLS: FinanceAccountToolDef[] = [
  { id: 'transactions', label: 'Transactions', permission: 'finance.transactions.view', keywords: ['transactions', 'txns', 'line items'], supportsAllAccounts: true, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'duplicates', label: 'Duplicates', permission: 'finance.transactions.manage', keywords: ['duplicates', 'dedupe'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'linker', label: 'Linker', permission: 'finance.transactions.manage', keywords: ['linker', 'transfers', 'matching'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'statements', label: 'Statements', permission: 'finance.accounts.detail', keywords: ['statements', 'balances'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'lots', label: 'Lots', permission: 'finance.lots.view', keywords: ['lots', 'tax lots', 'cost basis'], supportsAllAccounts: true, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'summary', label: 'Summary', permission: 'finance.accounts.detail', keywords: ['summary', 'overview'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'fees', label: 'Fees', permission: 'finance.accounts.detail', keywords: ['fees', 'fee drag', 'advisory fees'], supportsAllAccounts: true, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'basis', label: 'Basis', permission: 'finance.accounts.detail', keywords: ['basis', 'partnership basis', 'k1 basis', 'k-1 basis'], supportsAllAccounts: false, preserveYear: true, visibleInNavbarTabs: true },
  { id: 'import', label: 'Import', permission: 'finance.transactions.import', keywords: ['import', 'upload transactions'], supportsAllAccounts: true, preserveYear: false, visibleInNavbarTabs: false },
  { id: 'maintenance', label: 'Maintenance', permission: 'finance.accounts.manage', keywords: ['maintenance', 'settings'], supportsAllAccounts: false, preserveYear: false, visibleInNavbarTabs: false },
]
