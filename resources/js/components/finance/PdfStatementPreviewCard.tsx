import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from '@/components/ui/button'
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

interface PdfStatementPreviewCardProps {
  statementInfo: StatementInfo | undefined
  statementDetails: StatementDetail[]
}

export function PdfStatementPreviewCard({ statementInfo, statementDetails }: PdfStatementPreviewCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)

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
    <Card className="my-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>
            {statementInfo?.brokerName || 'PDF Statement'} 
            {statementInfo?.accountNumber && ` - ${statementInfo.accountNumber}`}
          </span>
          <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">View Details</Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Statement Details</DialogTitle>
                <DialogDescription>
                  {statementInfo?.periodStart && statementInfo?.periodEnd && (
                    <>Period: {statementInfo.periodStart} to {statementInfo.periodEnd}</>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6">
                {Object.entries(detailsBySection).map(([section, details]) => (
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
                ))}
              </div>
            </DialogContent>
          </Dialog>
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
    </Card>
  )
}
