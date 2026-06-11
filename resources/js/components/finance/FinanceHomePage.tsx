'use client'

import {
  ArrowRight,
  BookOpen,
  Briefcase,
  CheckSquare,
  FileText,
  Layers,
  List,
  Receipt,
  RefreshCw,
  Tags,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'

import MainTitle from '@/components/MainTitle'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface ChecklistItem {
  label: string
  icon: React.ReactNode
}

interface ActionItem {
  label: string
  href: string
  icon: React.ReactNode
  variant?: 'default' | 'outline'
}

interface PendingWorkItem {
  label: string
  icon: React.ReactNode
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { label: 'Accounts', icon: <Wallet className="h-4 w-4" /> },
  { label: 'Transactions', icon: <List className="h-4 w-4" /> },
  { label: 'Documents', icon: <FileText className="h-4 w-4" /> },
  { label: 'Jobs and Businesses', icon: <Briefcase className="h-4 w-4" /> },
  { label: 'Payslips', icon: <Receipt className="h-4 w-4" /> },
  { label: 'RSU', icon: <TrendingUp className="h-4 w-4" /> },
  { label: 'K-1 / Partnership Basis', icon: <BookOpen className="h-4 w-4" /> },
  { label: 'Lots / 1099-B Reconciliation', icon: <Layers className="h-4 w-4" /> },
  { label: 'Carryovers', icon: <RefreshCw className="h-4 w-4" /> },
  { label: 'Categorization', icon: <Tags className="h-4 w-4" /> },
  { label: 'Tax Preview', icon: <CheckSquare className="h-4 w-4" /> },
]

const PENDING_WORK_ITEMS: PendingWorkItem[] = [
  { label: 'Pending document reviews', icon: <FileText className="h-4 w-4" /> },
  { label: 'Missing account mappings', icon: <Wallet className="h-4 w-4" /> },
  { label: 'Lot reconciliation drift', icon: <Layers className="h-4 w-4" /> },
  { label: 'Duplicate transactions', icon: <List className="h-4 w-4" /> },
  { label: 'Unlinked transfers', icon: <ArrowRight className="h-4 w-4" /> },
  { label: 'Failed imports', icon: <Upload className="h-4 w-4" /> },
]

const PRIMARY_ACTIONS: ActionItem[] = [
  { label: 'Add account', href: '/finance/accounts', icon: <Wallet className="h-4 w-4" />, variant: 'default' },
  { label: 'Import transactions', href: '/finance/account/all/import', icon: <Upload className="h-4 w-4" />, variant: 'outline' },
  { label: 'Import tax documents', href: '/finance/documents', icon: <FileText className="h-4 w-4" />, variant: 'outline' },
  { label: 'Open Tax Preview', href: '/finance/tax-preview', icon: <CheckSquare className="h-4 w-4" />, variant: 'outline' },
]

export default function FinanceHomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <MainTitle>Finance Dashboard</MainTitle>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Setup Checklist */}
        <Card>
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Setup checklist">
              {CHECKLIST_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  {item.icon}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Recent and pending work */}
        <Card>
          <CardHeader>
            <CardTitle>Recent and pending work</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2" aria-label="Recent and pending work">
              {PENDING_WORK_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  {item.icon}
                  <span>{item.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Primary actions */}
      <Card>
        <CardHeader>
          <CardTitle>Primary actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-3" aria-label="Primary actions">
            {PRIMARY_ACTIONS.map((action) => (
              <li key={action.label}>
                <Button
                  variant={action.variant ?? 'default'}
                  asChild
                >
                  <a href={action.href} className="flex items-center gap-2">
                    {action.icon}
                    {action.label}
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
