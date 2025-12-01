import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface StatementInfo {
  brokerName?: string
  accountNumber?: string
  accountName?: string
  periodStart?: string
  periodEnd?: string
  closingBalance?: number
}

interface StatementDetail {
  section: string
  line_item: string
  statement_period_value: number
  ytd_value: number
  is_percentage: boolean
}

interface StatementDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  statementInfo: StatementInfo | undefined
  statementDetails: StatementDetail[]
}

export function StatementDetailsModal({ 
  isOpen, 
  onClose, 
  statementInfo, 
  statementDetails 
}: StatementDetailsModalProps) {
  // Group details by section
  const detailsBySection = statementDetails.reduce((acc, detail) => {
    const section = detail.section
    if (!acc[section]) {
      acc[section] = []
    }
    acc[section]!.push(detail)
    return acc
  }, {} as Record<string, StatementDetail[]>)

  const formatValue = (value: number, isPercentage: boolean) => {
    if (isPercentage) {
      return `${value.toFixed(2)}%`
    }
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {statementInfo?.brokerName || 'Statement Details'}
            {statementInfo?.accountNumber && ` - ${statementInfo.accountNumber}`}
          </DialogTitle>
          <DialogDescription>
            {statementInfo?.periodStart && statementInfo?.periodEnd && (
              <span>Period: {statementInfo.periodStart} to {statementInfo.periodEnd}</span>
            )}
            {statementInfo?.closingBalance !== undefined && (
              <span className="ml-4">
                Closing Balance: {statementInfo.closingBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {Object.entries(detailsBySection).length === 0 ? (
            <p className="text-muted-foreground">No details found for this statement.</p>
          ) : (
            Object.entries(detailsBySection).map(([section, details]) => (
              <div key={section}>
                <h3 className="font-semibold text-lg mb-2 border-b pb-1">{section}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Line Item</TableHead>
                      <TableHead className="text-right">Statement Period</TableHead>
                      <TableHead className="text-right">YTD</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {details.map((detail, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{detail.line_item}</TableCell>
                        <TableCell className={`text-right ${detail.statement_period_value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {formatValue(detail.statement_period_value, detail.is_percentage)}
                        </TableCell>
                        <TableCell className={`text-right ${detail.ytd_value < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                          {formatValue(detail.ytd_value, detail.is_percentage)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Re-export types for convenience
export type { StatementInfo, StatementDetail }
