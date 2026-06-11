'use client'

import {
  BookOpen,
  Briefcase,
  FileText,
  RefreshCw,
  TrendingUp,
  Upload,
  Wallet,
} from 'lucide-react'

import MainTitle from '@/components/MainTitle'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { hasAnyPermission } from '@/lib/permissions'

// ── card definitions ──────────────────────────────────────────────────────────

interface ImportCardDef {
  id: string
  title: string
  description: string
  formats: string[]
  href: string
  icon: React.ReactNode
  permissions: string[]
}

const IMPORT_CARDS: ImportCardDef[] = [
  {
    id: 'transactions',
    title: 'Bank / brokerage transactions',
    description: 'Import transaction history from your bank or brokerage accounts.',
    formats: ['CSV', 'QFX/OFX', 'HAR', 'IB activity statement', 'Broker statement PDF'],
    href: '/finance/account/all/import',
    icon: <Wallet className="h-5 w-5" />,
    permissions: ['finance.transactions.import'],
  },
  {
    id: 'tax-documents',
    title: 'Tax documents',
    description: 'Upload tax forms for automated review and extraction.',
    formats: ['W-2', '1099', '1099-B', 'K-1', '1116'],
    href: '/finance/documents',
    icon: <FileText className="h-5 w-5" />,
    permissions: ['finance.tax-documents.view', 'finance.tax-documents.manage'],
  },
  {
    id: 'payslips',
    title: 'Payslips',
    description: 'Import payroll documents or enter payslip data manually.',
    formats: ['Payroll PDFs', 'Manual entry'],
    href: '/finance/payslips',
    icon: <Upload className="h-5 w-5" />,
    permissions: ['finance.payslips.view', 'finance.payslips.manage'],
  },
  {
    id: 'rsu',
    title: 'RSU / equity awards',
    description: 'Manage grant details, vesting schedules, and settlement reviews.',
    formats: ['Grants', 'Vesting', 'Settlement review'],
    href: '/finance/rsu',
    icon: <TrendingUp className="h-5 w-5" />,
    permissions: ['finance.rsu.manage'],
  },
  {
    id: 'k1-basis',
    title: 'K-1 / partnership basis history',
    description: 'Import K-1 forms, basis events, and capital account history.',
    formats: ['K-1 forms', 'Basis events', 'Capital account history'],
    href: '/finance/documents',
    icon: <BookOpen className="h-5 w-5" />,
    permissions: ['finance.accounts.detail'],
  },
  {
    id: 'carryovers',
    title: 'Carryovers (manual entry)',
    description:
      'Enter prior-year carryover amounts: Schedule D capital loss carryover, passive activity loss carryforwards, and Form 8829 prior-year fields.',
    formats: ['Schedule D carryover', 'PAL carryforwards', 'Form 8829 prior-year fields'],
    href: '/finance/tax-preview',
    icon: <RefreshCw className="h-5 w-5" />,
    permissions: ['finance.tax-preview.view'],
  },
  {
    id: 'career-comparison',
    title: 'Set up current job (Career Comparison)',
    description: 'Configure your current compensation details for the Career Comparison calculator.',
    formats: ['Salary', 'Equity', 'Benefits'],
    href: '/financial-planning/career-comparison',
    icon: <Briefcase className="h-5 w-5" />,
    permissions: [],
  },
]

// ── sub-components ────────────────────────────────────────────────────────────

function ImportCard({ card }: { card: ImportCardDef }) {
  return (
    <Card data-testid={`import-card-${card.id}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {card.icon}
          <a href={card.href} className="hover:underline">
            {card.title}
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">{card.description}</p>
        <div className="flex flex-wrap gap-1">
          {card.formats.map((fmt) => (
            <span
              key={fmt}
              className="rounded-md border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {fmt}
            </span>
          ))}
        </div>
        <div className="mt-3">
          <a href={card.href} className="text-sm font-medium underline">
            Go to {card.title} →
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FinanceImportCenterPage() {
  const visibleCards = IMPORT_CARDS.filter((card) => {
    // Career Comparison is always visible (no permission gate)
    if (card.permissions.length === 0) {
      return true
    }
    return hasAnyPermission(card.permissions)
  })

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <MainTitle>Import Center</MainTitle>
      <p className="text-sm text-muted-foreground">
        Choose an import path below. Each option links to an existing workflow in Finance.
      </p>

      {visibleCards.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="no-cards-message">
          No import options are available for your account.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {visibleCards.map((card) => (
            <ImportCard key={card.id} card={card} />
          ))}
        </div>
      )}
    </div>
  )
}

export { IMPORT_CARDS }
