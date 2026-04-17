import { cn } from '@/lib/utils'

interface TransactionsSummaryCardsProps {
  netAmount: string
  netAmountPositive: boolean
  totalCredits: string
  totalDebits: string
  totalRows: number
}

export function TransactionsSummaryCards({ netAmount, netAmountPositive, totalCredits, totalDebits, totalRows }: TransactionsSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
        <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Net Amount</div>
        <div className={cn("font-mono text-xl font-semibold", netAmountPositive ? "text-success" : "text-destructive")}>
          {netAmount}
        </div>
      </div>
      <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
        <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Total Credits</div>
        <div className="font-mono text-xl font-semibold text-success">{totalCredits}</div>
      </div>
      <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
        <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Total Debits</div>
        <div className="font-mono text-xl font-semibold text-destructive">{totalDebits}</div>
      </div>
      <div className="bg-card border border-border p-4 rounded-sm shadow-sm">
        <div className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground mb-1.5">Rows Matching Filters</div>
        <div className="font-mono text-xl font-semibold text-foreground">{totalRows.toLocaleString()}</div>
      </div>
    </div>
  )
}
