import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatementDetailsModal, type StatementInfo, type StatementDetail } from './StatementDetailsModal'

interface PdfStatementPreviewCardProps {
  statementInfo: StatementInfo | undefined
  statementDetails: StatementDetail[]
}

export function PdfStatementPreviewCard({ statementInfo, statementDetails }: PdfStatementPreviewCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Group details by section for summary display
  const detailsBySection = statementDetails.reduce((acc, detail) => {
    const section = detail.section
    if (!acc[section]) {
      acc[section] = []
    }
    acc[section]!.push(detail)
    return acc
  }, {} as Record<string, StatementDetail[]>)

  return (
    <Card className="my-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>
            {statementInfo?.brokerName || 'PDF Statement'} 
            {statementInfo?.accountNumber && ` - ${statementInfo.accountNumber}`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setDetailsOpen(true)}>
            View Details
          </Button>
        </CardTitle>
        <CardDescription>
          {statementInfo?.periodStart && statementInfo?.periodEnd && (
            <span>Period: {statementInfo.periodStart} to {statementInfo.periodEnd}</span>
          )}
          {statementInfo?.closingBalance !== undefined && (
            <span className="ml-4">
              Closing Balance: {statementInfo.closingBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          {statementDetails.length} line items parsed across {Object.keys(detailsBySection).length} sections
        </div>
        {/* Quick summary of sections */}
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(detailsBySection).map(section => (
            <span key={section} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
              {section}
            </span>
          ))}
        </div>
      </CardContent>
      
      <StatementDetailsModal
        isOpen={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        statementInfo={statementInfo}
        statementDetails={statementDetails}
      />
    </Card>
  )
}
