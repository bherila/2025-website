import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Plus, DollarSign, Clock } from 'lucide-react'
import InvitePeopleModal from '@/components/client-management/InvitePeopleModal'
import ClientAdminActions from '@/components/client-management/ClientAdminActions'
import type { User, ClientCompany } from '@/types/client-management/common'

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
  const [runInvoicingCompanyId, setRunInvoicingCompanyId] = useState<number | null>(null)

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

  const activeCompanies = companies.filter(c => c.is_active)
  const inactiveCompanies = companies.filter(c => !c.is_active)

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Client Management</h1>
        <div className="flex gap-2">
          <Button onClick={() => setInviteModalOpen(true)}>
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
                  <CardTitle className="text-xl">{company.company_name}</CardTitle>
                  <div className="mt-2 space-y-1">
                    <div className="text-sm text-muted-foreground">
                      {company.users.length} {company.users.length === 1 ? 'user' : 'users'}
                    </div>
                    {company.total_balance_due !== undefined && company.total_balance_due > 0 && (
                      <div className="flex items-center gap-1.5 text-sm">
                        <DollarSign className="h-4 w-4 text-orange-600" />
                        <span className="font-medium text-orange-600">
                          ${company.total_balance_due.toFixed(2)} balance due
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
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => setRunInvoicingCompanyId(company.id)}
                  >
                    Run Invoicing
                  </Button>
                  {company.slug && (
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => window.location.href = `/client/portal/${company.slug}`}
                    >
                      Portal
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.location.href = `/client/mgmt/${company.id}`}
                  >
                    Details
                  </Button>
                </div>
              </div>
            </CardHeader>
            {company.users.length > 0 && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {company.users.map(user => (
                    <Badge key={user.id} variant="secondary" className="py-1">
                      <span>{user.name}</span>
                      <span className="ml-1 text-xs opacity-70">({formatLastLogin(user.last_login_date)})</span>
                    </Badge>
                  ))}
                </div>
              </CardContent>
            )}
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
                        Details
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
      />

      {runInvoicingCompanyId && (
        <ClientAdminActions
          companyId={runInvoicingCompanyId}
          onClose={() => setRunInvoicingCompanyId(null)}
          onSuccess={() => {
            setRunInvoicingCompanyId(null)
            fetchCompanies()
          }}
        />
      )}
    </div>
  )
}
