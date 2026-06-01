import { Repeat, X } from 'lucide-react'
import { useCallback } from 'react'

import ActivityTab from '@/client-management/components/admin/company/ActivityTab'
import AgreementsTab from '@/client-management/components/admin/company/AgreementsTab'
import ClientManagementHeader from '@/client-management/components/admin/company/ClientManagementHeader'
import CompanyOverviewTab from '@/client-management/components/admin/company/CompanyOverviewTab'
import ProposalsTab from '@/client-management/components/admin/company/ProposalsTab'
import RecurringItemsEditor from '@/client-management/components/admin/RecurringItemsEditor'
import ClientPortalNav from '@/client-management/components/portal/ClientPortalNav'
import { useClientCompanyDetail } from '@/client-management/hooks/useClientCompanyDetail'
import { useCreateAgreement } from '@/client-management/hooks/useCreateAgreement'
import { useCreateProposal } from '@/client-management/hooks/useCreateProposal'
import { useDismissibleAlert } from '@/client-management/hooks/useDismissibleAlert'
import { useHashTab } from '@/client-management/hooks/useHashTab'
import type { ClientCompany } from '@/client-management/types/common'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ClientManagementShowPageProps {
  companyId: number
}

export default function ClientManagementShowPage({ companyId }: ClientManagementShowPageProps) {
  const { alertInfo, showAlert, dismissAlert } = useDismissibleAlert()
  const showError = useCallback((message: string) => showAlert(message, 'destructive'), [showAlert])
  const { company, setCompany, loading, fetchCompany } = useClientCompanyDetail(companyId, showError)
  const [activeTab, changeTab] = useHashTab('overview')
  const { createAgreement, creating } = useCreateAgreement(companyId, showError)
  const { createProposal, creating: creatingProposal } = useCreateProposal(companyId, showError)

  const renderAlert = () =>
    alertInfo && (
      <Alert variant={alertInfo.variant} className="mb-4 relative">
        <AlertTitle>{alertInfo.variant === 'destructive' ? 'Error' : 'Success'}</AlertTitle>
        <AlertDescription>{alertInfo.message}</AlertDescription>
        <button onClick={dismissAlert} className="absolute top-2 right-2 p-1">
          <X className="h-4 w-4" />
        </button>
      </Alert>
    )

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  if (!company) {
    return (
      <div className="p-8">
        {renderAlert()}
        Company not found
      </div>
    )
  }

  const activeAgreement =
    company.agreements.find((agreement) => !agreement.termination_date) ?? company.agreements[0] ?? null

  const handleSaved = (updated: ClientCompany) => {
    setCompany(updated)
    showAlert('Company updated successfully')
  }

  return (
    <>
      <ClientPortalNav
        slug={company.slug || ''}
        companyName={company.company_name}
        companyId={company.id}
        currentPage="manage"
      />
      <div className="container mx-auto p-8 max-w-7xl">
        {renderAlert()}
        <ClientManagementHeader company={company} />

        <Tabs value={activeTab} onValueChange={changeTab} className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="proposals">Proposals</TabsTrigger>
            <TabsTrigger value="agreements">Agreements</TabsTrigger>
            <TabsTrigger value="recurring">Recurring items</TabsTrigger>
            <TabsTrigger value="activity">Notes / Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <CompanyOverviewTab
              company={company}
              companyId={companyId}
              activeAgreement={activeAgreement}
              onSaved={handleSaved}
              onError={showError}
              onChanged={fetchCompany}
              onCreateAgreement={() => void createAgreement()}
              creating={creating}
              onViewAllAgreements={() => changeTab('agreements')}
            />
          </TabsContent>

          <TabsContent value="proposals">
            <ProposalsTab
              companyId={company.id}
              onCreateProposal={() => void createProposal()}
              creating={creatingProposal}
            />
          </TabsContent>

          <TabsContent value="agreements">
            <AgreementsTab
              agreements={company.agreements}
              onCreateAgreement={() => void createAgreement()}
              creating={creating}
            />
          </TabsContent>

          <TabsContent value="recurring">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="h-5 w-5" />
                  Recurring Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                <RecurringItemsEditor companyId={company.id} agreement={activeAgreement} onChanged={fetchCompany} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity">
            <ActivityTab company={company} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
