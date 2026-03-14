'use client'

import { useState } from 'react'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { cn } from '@/lib/utils'

export type FinanceSection = 'accounts' | 'rsu' | 'payslips' | 'all-transactions' | 'schedule-c'

/** Nav items for the FINANCE sub-navigation bar */
export const FINANCE_SECTIONS: { value: FinanceSection; label: string; href: string }[] = [
  { value: 'accounts', label: 'Accounts', href: '/finance/accounts' },
  { value: 'all-transactions', label: 'Transactions', href: '/finance/all-transactions' },
  { value: 'schedule-c', label: 'Schedule C', href: '/finance/schedule-c' },
  { value: 'rsu', label: 'RSU', href: '/finance/rsu' },
  { value: 'payslips', label: 'Payslips', href: '/finance/payslips' },
]

interface FinanceSubNavProps {
  activeSection: FinanceSection
  /** Additional breadcrumb items to append after the section */
  breadcrumbItems?: React.ReactNode
  /** Additional content rendered below the breadcrumb (e.g., account tabs) */
  children?: React.ReactNode
}

/** Reads isAdmin from the server-provided app-initial-data script tag. */
function readIsAdmin(): boolean {
  try {
    const script = document.getElementById('app-initial-data')
    if (script?.textContent) {
      return !!JSON.parse(script.textContent).isAdmin
    }
  } catch {
    // fall through
  }
  return false
}

/**
 * Shared sub-navigation bar for all Finance pages.
 *
 * Renders a full-width sticky bar directly below the main navbar with:
 * - "FINANCE" branding on the left
 * - Section navigation links in the centre
 * - "Manage Tags" admin link on the far right
 *
 * Below the bar, a breadcrumb trail is shown, followed by any `children`
 * (e.g., account-specific tabs).
 */
export default function FinanceSubNav({ activeSection, breadcrumbItems, children }: FinanceSubNavProps) {
  const activeSectionInfo = FINANCE_SECTIONS.find(s => s.value === activeSection)
  const [isAdmin] = useState(readIsAdmin)
  const isTagsPage = typeof window !== 'undefined' && window.location.pathname === '/finance/tags'

  return (
    <div>
      {/* FINANCE sticky sub-navigation bar */}
      <div className="sticky top-14 z-40 w-full border-b bg-background">
        <div className="flex items-center gap-4 px-4 h-12">
          <span
            className="text-xs font-bold tracking-widest uppercase text-foreground select-none"
            aria-label="Finance section"
          >
            Finance
          </span>

          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              {FINANCE_SECTIONS.map((section) => (
                <NavigationMenuItem key={section.value}>
                  <NavigationMenuLink
                    href={section.href}
                    aria-current={section.value === activeSection ? 'page' : undefined}
                    className={cn(
                      navigationMenuTriggerStyle(),
                      'h-8 px-3 text-sm',
                      section.value === activeSection
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground',
                    )}
                  >
                    {section.label}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          {isAdmin && (
            <div className="ml-auto">
              <a
                href="/finance/tags"
                aria-current={isTagsPage ? 'page' : undefined}
                className={cn(
                  navigationMenuTriggerStyle(),
                  'h-8 px-3 text-sm',
                  isTagsPage
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground',
                )}
              >
                Manage Tags
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Breadcrumb below subnav */}
      <div className="px-8 py-3">
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

      {children}
    </div>
  )
}
