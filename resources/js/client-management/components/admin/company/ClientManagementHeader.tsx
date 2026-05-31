import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'

import type { ClientCompany } from '@/client-management/types/common'
import { Button } from '@/components/ui/button'

/** Title row and navigation actions for the company management page. */
export default function ClientManagementHeader({ company }: { company: ClientCompany }) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-3xl font-bold">Client Company Details</h1>
      <div className="flex gap-2">
        {company.slug && (
          <Button variant="secondary" onClick={() => (window.location.href = `/client/portal/${company.slug}/invoices`)}>
            <FileText className="mr-2 h-4 w-4" />
            Invoices
          </Button>
        )}
        <Button variant="secondary" onClick={() => (window.location.href = '/client/mgmt')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to List
        </Button>
        {company.slug && (
          <Button variant="default" onClick={() => (window.location.href = `/client/portal/${company.slug}`)}>
            <ExternalLink className="mr-2 h-4 w-4" />
            View Portal
          </Button>
        )}
      </div>
    </div>
  )
}
