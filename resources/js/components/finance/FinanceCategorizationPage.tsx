'use client'

import { ExternalLink } from 'lucide-react'

import MainTitle from '@/components/MainTitle'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CATEGORY_LABELS, TAX_CHARACTERISTICS } from '@/lib/finance/taxCharacteristics'
import { hasPermission } from '@/lib/permissions'

import ManageTagsPage from './ManageTagsPage'
import RulesList from './rules_engine/RulesList'

// ── tab definitions ───────────────────────────────────────────────────────────

interface TabDef {
  id: string
  label: string
  permission: string | null
}

const CATEGORIZATION_TABS: TabDef[] = [
  { id: 'tags', label: 'Tags', permission: 'finance.rules.manage' },
  { id: 'rules', label: 'Rules', permission: 'finance.rules.manage' },
  { id: 'tax-characteristics', label: 'Tax Characteristics', permission: 'finance.rules.manage' },
  { id: 'schedule-c', label: 'Schedule C Mapping', permission: null },
]

// ── Tax Characteristics panel ─────────────────────────────────────────────────

function TaxCharacteristicsPanel() {
  const byCategory = Object.entries(TAX_CHARACTERISTICS).reduce<Record<string, { code: string; label: string }[]>>(
    (acc, [code, meta]) => {
      const cat = meta.category
      if (!acc[cat]) {
        acc[cat] = []
      }
      acc[cat].push({ code, label: meta.label })
      return acc
    },
    {},
  )

  return (
    <div className="space-y-6" data-testid="tax-characteristics-panel">
      <p className="text-sm text-muted-foreground">
        Tax characteristics classify transactions for Schedule C, W-2, and investment income purposes.
        Assign characteristics to tags in the Tags tab.
      </p>
      {Object.entries(byCategory).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base">{CATEGORY_LABELS[category] ?? category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {items.map(({ code, label }) => (
                <Badge key={code} variant="outline" title={code}>
                  {label}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Schedule C deep-link panel ────────────────────────────────────────────────

function ScheduleCMappingPanel() {
  return (
    <Card data-testid="schedule-c-panel">
      <CardHeader>
        <CardTitle>Schedule C Mapping</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Schedule C income and expense mapping is managed inside Tax Preview, where it is coupled to
          the live tax computation.
        </p>
        <a
          href="/finance/tax-preview"
          className="inline-flex items-center gap-1.5 text-sm font-medium underline"
          data-testid="schedule-c-link"
        >
          Open Tax Preview
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </CardContent>
    </Card>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FinanceCategorizationPage() {
  const visibleTabs = CATEGORIZATION_TABS.filter((tab) => {
    if (tab.permission === null) {
      return true
    }
    return hasPermission(tab.permission)
  })

  const defaultTab = visibleTabs[0]?.id ?? 'schedule-c'

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <MainTitle>Categorization</MainTitle>
      <p className="text-sm text-muted-foreground">
        Manage tags, categorization rules, and tax characteristics for your transactions.
      </p>

      <Tabs defaultValue={defaultTab}>
        <TabsList data-testid="categorization-tabs-list">
          {visibleTabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} data-testid={`tab-${tab.id}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleTabs.some((t) => t.id === 'tags') && (
          <TabsContent value="tags" data-testid="tab-content-tags">
            <ManageTagsPage />
          </TabsContent>
        )}

        {visibleTabs.some((t) => t.id === 'rules') && (
          <TabsContent value="rules" data-testid="tab-content-rules">
            <div className="py-4">
              <RulesList />
            </div>
          </TabsContent>
        )}

        {visibleTabs.some((t) => t.id === 'tax-characteristics') && (
          <TabsContent value="tax-characteristics" data-testid="tab-content-tax-characteristics">
            <div className="py-4">
              <TaxCharacteristicsPanel />
            </div>
          </TabsContent>
        )}

        {visibleTabs.some((t) => t.id === 'schedule-c') && (
          <TabsContent value="schedule-c" data-testid="tab-content-schedule-c">
            <div className="py-4">
              <ScheduleCMappingPanel />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export { CATEGORIZATION_TABS }
