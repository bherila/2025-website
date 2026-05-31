import { Pencil } from 'lucide-react'
import { useState } from 'react'

import CyclePreviewPanel from '@/client-management/components/admin/CyclePreviewPanel'
import ActivityTimeline from '@/client-management/components/shared/activity/ActivityTimeline'
import AgreementList from '@/client-management/components/shared/agreement/AgreementList'
import { MetricGrid } from '@/client-management/components/shared/time/MetricGrid'
import type { Agreement, ClientCompany } from '@/client-management/types/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import { openAgreement } from './agreementNav'
import AssociatedUsersCard from './AssociatedUsersCard'
import { buildOverviewMetrics } from './companyMetrics'
import CompanyProfileForm from './CompanyProfileForm'

interface CompanyOverviewTabProps {
  company: ClientCompany
  companyId: number
  activeAgreement: Agreement | null
  onSaved: (company: ClientCompany) => void
  onError: (message: string) => void
  onChanged: () => Promise<void> | void
  onCreateAgreement: () => void
  creating: boolean
  onViewAllAgreements: () => void
}

function ProfileField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
    </div>
  )
}

/** Dashboard-first overview: snapshot tiles, profile summary (edit in a dialog), active agreement, users, recent activity. */
export default function CompanyOverviewTab({
  company,
  companyId,
  activeAgreement,
  onSaved,
  onError,
  onChanged,
  onCreateAgreement,
  creating,
  onViewAllAgreements,
}: CompanyOverviewTabProps) {
  const [editOpen, setEditOpen] = useState(false)

  const handleSaved = (updated: ClientCompany) => {
    onSaved(updated)
    setEditOpen(false)
  }

  return (
    <div className="space-y-6">
      <CyclePreviewPanel company={company} agreement={activeAgreement} />

      <MetricGrid metrics={buildOverviewMetrics(company)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Company Profile</CardTitle>
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit company
              </Button>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit company</DialogTitle>
                </DialogHeader>
                <CompanyProfileForm
                  company={company}
                  companyId={companyId}
                  onSaved={handleSaved}
                  onError={onError}
                />
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ProfileField label="Name" value={company.company_name} />
              <ProfileField
                label="Portal"
                value={
                  company.slug ? (
                    <a href={`/client/portal/${company.slug}`} className="text-blue-600 hover:underline">
                      /{company.slug}
                    </a>
                  ) : null
                }
              />
              <ProfileField label="Website" value={company.website} />
              <ProfileField label="Phone" value={company.phone_number} />
              <ProfileField
                label="Default rate"
                value={company.default_hourly_rate ? `$${company.default_hourly_rate}/hr` : null}
              />
              <ProfileField
                label="Status"
                value={
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={company.is_active ? 'default' : 'secondary'}>
                      {company.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                    {company.stripe_billing_enabled && <Badge variant="outline">Stripe</Badge>}
                  </div>
                }
              />
            </div>
            <div className="text-xs text-muted-foreground">
              ID {company.id} · Created {new Date(company.created_at).toLocaleDateString()}
              {company.last_activity ? ` · Last activity ${new Date(company.last_activity).toLocaleString()}` : ''}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Active Agreement</CardTitle>
            <Button size="sm" onClick={onCreateAgreement} disabled={creating}>
              Create New Agreement
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <AgreementList
              agreements={activeAgreement ? [activeAgreement] : []}
              onOpen={openAgreement}
              actionLabel="View"
              emptyMessage="No agreements found for this company."
            />
            {company.agreements.length > 1 && (
              <Button variant="link" className="px-0" onClick={onViewAllAgreements}>
                View all {company.agreements.length} agreements →
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <AssociatedUsersCard company={company} companyId={companyId} onChanged={onChanged} onError={onError} />

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityTimeline activities={company.activities ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
