import AgreementList from '@/client-management/components/shared/agreement/AgreementList'
import type { Agreement } from '@/client-management/types/common'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import { openAgreement } from './agreementNav'

interface AgreementsTabProps {
  agreements: Agreement[]
  onCreateAgreement: () => void
  creating: boolean
}

/** Full agreement timeline tab. */
export default function AgreementsTab({ agreements, onCreateAgreement, creating }: AgreementsTabProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Agreement Timeline</CardTitle>
        <Button size="sm" onClick={onCreateAgreement} disabled={creating}>
          Create New Agreement
        </Button>
      </CardHeader>
      <CardContent>
        <AgreementList agreements={agreements} onOpen={openAgreement} actionLabel="Open" />
      </CardContent>
    </Card>
  )
}
