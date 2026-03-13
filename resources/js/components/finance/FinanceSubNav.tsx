'use client'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

export type FinanceSection = 'accounts' | 'rsu' | 'payslips' | 'all-transactions' | 'schedule-c'

const FINANCE_SECTIONS: { value: FinanceSection; label: string; href: string }[] = [
  { value: 'accounts', label: 'Accounts', href: '/finance/accounts' },
  { value: 'all-transactions', label: 'All Transactions', href: '/finance/all-transactions' },
  { value: 'schedule-c', label: 'Schedule C', href: '/finance/schedule-c' },
  { value: 'rsu', label: 'RSU', href: '/finance/rsu' },
  { value: 'payslips', label: 'Payslips', href: '/finance/payslips' },
]

interface FinanceSubNavProps {
  activeSection: FinanceSection
  /** Additional breadcrumb items to append after the section */
  breadcrumbItems?: React.ReactNode
  /** Additional content rendered below the breadcrumb (e.g., tabs) */
  children?: React.ReactNode
}

/**
 * Shared sub-navigation bar for all finance pages.
 * Renders a breadcrumb starting with "Finance" followed by section links,
 * then a horizontal section-switcher bar.
 */
export default function FinanceSubNav({ activeSection, breadcrumbItems, children }: FinanceSubNavProps) {
  const activeSectionInfo = FINANCE_SECTIONS.find(s => s.value === activeSection)

  return (
    <div className="mt-4 px-8">
      <div className="py-4 px-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/finance/accounts">Finance</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            {breadcrumbItems ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink href={activeSectionInfo!.href}>
                    {activeSectionInfo!.label}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {breadcrumbItems}
              </>
            ) : (
              <BreadcrumbItem>
                <BreadcrumbPage>
                  {activeSectionInfo?.label ?? activeSection}
                </BreadcrumbPage>
              </BreadcrumbItem>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex gap-2 mb-3 px-4">
        {FINANCE_SECTIONS.map((section) => (
          <a
            key={section.value}
            href={section.href}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              section.value === activeSection
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {section.label}
          </a>
        ))}
      </div>
      {children}
    </div>
  )
}
