'use client'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { fetchWrapper } from '@/fetchWrapper'
import type { Lot } from '@/types/finance/lot'

interface Props {
    accountId: number
    transactionId: number
    isOpen: boolean
    onClose: () => void
}

function formatCurrency(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '—'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return '—'
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    try {
        const d = new Date(dateStr.split(/[ T]/)[0] + 'T00:00:00')
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
        return dateStr
    }
}

export default function TransactionLotsModal({ accountId, transactionId, isOpen, onClose }: Props) {
    const [lots, setLots] = useState<Lot[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        if (!isOpen) return
        setIsLoading(true)
        fetchWrapper.get(`/api/finance/${accountId}/lots/by-transaction/${transactionId}`)
            .then((data: any) => setLots(data.lots ?? []))
            .catch(console.error)
            .finally(() => setIsLoading(false))
    }, [isOpen, accountId, transactionId])

    return (
        <Dialog open={isOpen} onOpenChange={() => onClose()}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
                <DialogHeader>
                    <DialogTitle>Lots for Transaction #{transactionId}</DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex justify-center p-4"><Spinner /></div>
                ) : lots.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">No lots linked to this transaction.</p>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Symbol</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead>Purchase Date</TableHead>
                                    <TableHead className="text-right">Cost Basis</TableHead>
                                    <TableHead>Sale Date</TableHead>
                                    <TableHead className="text-right">Proceeds</TableHead>
                                    <TableHead className="text-right">Gain/Loss</TableHead>
                                    <TableHead>Type</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {lots.map(lot => {
                                    const isOpen = lot.open_t_id === transactionId
                                    const isClose = lot.close_t_id === transactionId
                                    const gainLoss = lot.realized_gain_loss ? parseFloat(lot.realized_gain_loss) : null
                                    return (
                                        <TableRow key={lot.lot_id}>
                                            <TableCell>
                                                {isOpen && <Badge className="bg-blue-600">Buy</Badge>}
                                                {isClose && <Badge className="bg-orange-600">Sell</Badge>}
                                            </TableCell>
                                            <TableCell className="font-medium">{lot.symbol}</TableCell>
                                            <TableCell className="text-right font-mono">
                                                {parseFloat(lot.quantity).toLocaleString('en-US', { maximumFractionDigits: 4 })}
                                            </TableCell>
                                            <TableCell>{formatDate(lot.purchase_date)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(lot.cost_basis)}</TableCell>
                                            <TableCell>{formatDate(lot.sale_date)}</TableCell>
                                            <TableCell className="text-right font-mono">{formatCurrency(lot.proceeds)}</TableCell>
                                            <TableCell className={`text-right font-mono ${gainLoss !== null && gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatCurrency(lot.realized_gain_loss)}
                                            </TableCell>
                                            <TableCell>
                                                {lot.is_short_term !== null && (
                                                    <Badge variant={lot.is_short_term ? 'secondary' : 'outline'}>
                                                        {lot.is_short_term ? 'ST' : 'LT'}
                                                    </Badge>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
