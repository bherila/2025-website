'use client'

import { Info } from 'lucide-react'

import CustomLink from '@/components/link'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import type { LotSale } from '@/lib/finance/washSaleEngine'

// Re-declaring these here to keep the component self-contained, 
// or they could be imported from a common utils file.
function formatCurrency(value: number): string {
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    })
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return 'Various'
    try {
        const d = new Date(dateStr + 'T00:00:00')
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
        return dateStr
    }
}

interface VariousTransactionsModalProps {
    lot: LotSale
}

export function VariousTransactionsModal({ lot }: VariousTransactionsModalProps) {
    const count = lot.acquiredTransactions?.length ?? 0
    const label = count > 1 ? `Various (${count})` : count === 1 ? formatDate(lot.acquiredTransactions![0].date) : 'Unknown'

    return (
        <Dialog>
            <DialogTrigger asChild>
                <CustomLink 
                    href="#" 
                    className="text-sm inline-flex items-center gap-1 group cursor-pointer"
                >
                    {label}
                    <Info className="h-3 w-3 opacity-70 group-hover:opacity-100 transition-opacity" />
                </CustomLink>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Acquired Transactions Details</DialogTitle>
                </DialogHeader>
                <div className="mt-4 border rounded-md overflow-auto">
                    {!lot.acquiredTransactions || lot.acquiredTransactions.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p className="mb-2 font-medium text-foreground text-sm uppercase tracking-wider">No Matching Purchases Found</p>
                            <p className="text-sm">
                                No specific matching purchase transactions were found for this lot in the current data set.
                                This could happen if the purchase occurred before the earliest transaction imported,
                                or if the cost basis was manually entered.
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Quantity</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Basis Contribution</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lot.acquiredTransactions.map((tx, idx) => (
                                    <TableRow key={tx.id ?? idx}>
                                        <TableCell>{formatDate(tx.date)}</TableCell>
                                        <TableCell className="max-w-[300px] truncate" title={tx.description}>
                                            {tx.description}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">{tx.qty}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(tx.price)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(tx.price * tx.qty)}</TableCell>
                                    </TableRow>
                                ))}
                                <TableRow className="font-semibold bg-muted/50">
                                    <TableCell colSpan={2}>Total</TableCell>
                                    <TableCell className="text-right font-mono">
                                        {lot.acquiredTransactions.reduce((sum, tx) => sum + tx.qty, 0)}
                                    </TableCell>
                                    <TableCell></TableCell>
                                    <TableCell className="text-right font-mono">
                                        {formatCurrency(lot.costBasis)}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    )
}
