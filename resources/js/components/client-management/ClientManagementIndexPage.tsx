import currency from 'currency.js'
import { ChevronDown, ChevronUp, Clock, DollarSign, ExternalLink, FileText, Package, Plus, TrendingUp, Wrench } from 'lucide-react'
import { useEffect,useState } from 'react'

import InvitePeopleModal from '@/components/client-management/InvitePeopleModal'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ClientCompany } from '@/types/client-management/common'

function formatLastLogin(lastLogin: string | null | undefined): string {
  if (!lastLogin) return 'never logged in'
  const date = new Date(lastLogin)
  return `last login ${date.toLocaleDateString()}`
}

export default function ClientManagementIndexPage() {
  const [companies, setCompanies] = useState<ClientCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null)

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    try {
      const response = await fetch('/api/client/mgmt/companies')
      const data = await response.json()
      setCompanies(data)
    } catch (error) {
      console.error('Error fetching companies:', error)
    } finally {
      setLoading(false)
    }
  }

  const openInviteModal = (companyId?: number) => {
    setSelectedCompanyId(companyId || null)
    setInviteModalOpen(true)
  }

  const activeCompanies = companies.filter(c => c.is_active)
  const inactiveCompanies = companies.filter(c => !c.is_active)

  if (loading) {
    return (
      <div className="container mx-auto p-8 max-w-6xl">
        <div className="flex justify-between items-center mb-6">
          <Skeleton className="h-9 w-64" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Client Management</h1>
        <div className="flex gap-2">
          <Button onClick={() => openInviteModal()}>
            <Plus className="mr-2 h-4 w-4" />
            Invite People
          </Button>
          <Button onClick={() => window.location.href = '/client/mgmt/new'}>
            <Plus className="mr-2 h-4 w-4" />
            New Company
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {activeCompanies.map(company => (
          <Card key={company.id}>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-xl">{company.company_name}</CardTitle>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-sm text-muted-foreground">
                      {company.users.length} {company.users.length === 1 ? 'user' : 'users'}
                    </div>
                    {company.total_balance_due !== undefined && company.total_balance_due > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <DollarSign className="h-4 w-4 text-orange-600" />
                        <span className="font-medium text-orange-600">
                          {currency(company.total_balance_due).format()} balance due
                        </span>
                      </div>
                    )}
                    {company.uninvoiced_hours !== undefined && company.uninvoiced_hours > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="font-medium text-blue-600">
                          {company.uninvoiced_hours.toFixed(2)} uninvoiced hours
                        </span>
                      </div>
                    )}
                    {company.uninvoiced_task_total !== undefined && company.uninvoiced_task_total > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <Package className="h-4 w-4 text-purple-600" />
                        <span className="font-medium text-purple-600">
                          {currency(company.uninvoiced_task_total).format()} uninvoiced tasks
                          {company.uninvoiced_task_complete_total !== undefined && company.uninvoiced_task_complete_total > 0 && (
                            <span className="ml-1 text-xs">
                              ({currency(company.uninvoiced_task_complete_total).format()} complete, {currency(company.uninvoiced_task_incomplete_total ?? 0).format()} incomplete)
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                    {company.lifetime_value !== undefined && company.lifetime_value > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="font-medium text-green-600">
                          {currency(company.lifetime_value).format()} lifetime value
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => window.location.href = `/client/mgmt/${company.id}`}
                  >
                    <Wrench className="mr-1.5 h-3.5 w-3.5" />
                    Manage
                  </Button>
                  {company.slug && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => window.location.href = `/client/portal/${company.slug}`}
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Portal
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {company.unpaid_invoices && company.unpaid_invoices.length > 0 && (
                <div className="border-t pt-3">
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Unpaid Invoices
                  </h4>
                  <div className="space-y-2">
                    {company.unpaid_invoices.map(invoice => (
                      <div key={invoice.client_invoice_id} className="flex justify-between items-center text-sm p-2 bg-muted/30 rounded-md border border-muted">
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{invoice.invoice_number}</span>
                          <span className="text-muted-foreground">Due: {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : 'N/A'}</span>
                          <Badge variant={invoice.status === 'issued' ? 'destructive' : 'secondary'} className="text-[10px] py-0 px-1.5">
                            {invoice.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-orange-600">{currency(Number(invoice.remaining_balance)).format()}</span>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 px-2 text-xs"
                            onClick={() => window.location.href = `/client/portal/${company.slug}/invoice/${invoice.client_invoice_id}`}
                          >
                            View →
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {company.users.length > 0 ? (
                <div className="flex flex-wrap gap-2 items-center">
                  {company.users.map(user => (
                    <Badge key={user.id} variant="secondary" className="py-1">
                      <span>{user.name}</span>
                      <span className="ml-1 text-xs opacity-70">({formatLastLogin(user.last_login_date)})</span>
                    </Badge>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openInviteModal(company.id)}
                    className="h-7"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add User
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openInviteModal(company.id)}
                  className="h-7"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add User
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {inactiveCompanies.length > 0 && (
        <div className="mt-8">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
            Inactive Companies ({inactiveCompanies.length})
          </Button>
          
          {showInactive && (
            <div className="mt-4 space-y-4">
              {inactiveCompanies.map(company => (
                <Card key={company.id} className="opacity-60">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-xl">{company.company_name}</CardTitle>
                        <Badge variant="outline" className="mt-2">Inactive</Badge>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => window.location.href = `/client/mgmt/${company.id}`}
                      >
                        <Wrench className="mr-1.5 h-3.5 w-3.5" />
                        Manage
                      </Button>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      <InvitePeopleModal
        open={inviteModalOpen}
        onOpenChange={setInviteModalOpen}
        companies={companies}
        onSuccess={fetchCompanies}
        preselectedCompanyId={selectedCompanyId}
      />
    </div>
  )
}
