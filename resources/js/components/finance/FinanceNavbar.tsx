'use client'

import { ArrowLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type FinanceSection = 'accounts' | 'rsu' | 'payslips' | 'all-transactions' | 'schedule-c' | 'tags'

/** Nav items for the FINANCE navigation bar */
export const FINANCE_SECTIONS: { value: FinanceSection; label: string; href: string }[] = [
  { value: 'accounts', label: 'Accounts', href: '/finance/accounts' },
  { value: 'all-transactions', label: 'Transactions', href: '/finance/all-transactions' },
  { value: 'schedule-c', label: 'Schedule C', href: '/finance/schedule-c' },
  { value: 'rsu', label: 'RSU', href: '/finance/rsu' },
  { value: 'payslips', label: 'Payslips', href: '/finance/payslips' },
]

export interface FinanceNavbarProps {
  activeSection: FinanceSection
  /** Additional content rendered below the navigation bar (e.g., account tabs) */
  children?: React.ReactNode
}

/**
 * Primary navigation bar for all Finance pages.
 *
 * Replaces the main site navbar on finance pages with:
 * - "←" back button linking to "/" with tooltip "Back to BWH"
 * - "FINANCE" branding on the left
 * - Section navigation links
 * - "Manage Tags" link on the far right (available to all authenticated users)
 *
 * Below the bar, any `children` (e.g., account-specific tabs) are rendered.
 */
export default function FinanceNavbar({ activeSection, children }: FinanceNavbarProps) {
  return (
    <div>
      {/* FINANCE navigation bar */}
      <div className="w-full border-b bg-background">
        <div className="flex items-center gap-4 px-4 h-12">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon" className="h-7 w-7 shrink-0" asChild>
                <a href="/" aria-label="Back to BWH">
                  <ArrowLeft className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Back to BWH</TooltipContent>
          </Tooltip>

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

          <div className="ml-auto flex items-center gap-2">
            <a
              href="/finance/tags"
              aria-current={activeSection === 'tags' ? 'page' : undefined}
              className={cn(
                navigationMenuTriggerStyle(),
                'h-8 px-3 text-sm',
                activeSection === 'tags'
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground',
              )}
            >
              Manage Tags
            </a>
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
