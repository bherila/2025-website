'use client'

import currency from 'currency.js'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
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
import type { LotSale } from '@/lib/finance/washSaleEngine'

interface LotMatchSearchModalProps {
    lot: LotSale
    isOpen: boolean
    onClose: () => void
    onAssignmentSaved?: () => void
}

interface SearchResult {
    t_id: number
    t_account: number
    acct_name?: string
    t_date: string
    t_type: string
    t_description?: string
    t_symbol: string
    t_qty: number
    t_amt: number
    t_price: number
}

/**
 * Modal dialog for searching and manually matching opening transactions
 * with a closing transaction (sale) from the Lot Analyzer.
 *
 * This is for lot analysis / tax reporting, NOT for cross-account transfer
 * linking (that is handled by TransactionLinkModal).
 */
export function LotMatchSearchModal({ lot, isOpen, onClose, onAssignmentSaved }: LotMatchSearchModalProps) {
    const [isSearching, setIsSearching] = useState(false)
    const [results, setResults] = useState<SearchResult[]>([])
    const [selected, setSelected] = useState<SearchResult[]>([])
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saveSuccess, setSaveSuccess] = useState(false)

    const totalSelectedQty = selected.reduce((sum, s) => sum + Math.abs(s.t_qty), 0)
    const targetQty = lot.quantity

    const handleSearch = useCallback(async () => {
        setIsSearching(true)
        setError(null)
        try {
            const data = await fetchWrapper.post('/api/finance/lots/search-opening', {
                symbol: lot.symbol,
                type: 'buy',
            })
            setResults(data.transactions || [])
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Search failed')
        } finally {
            setIsSearching(false)
        }
    }, [lot.symbol])

    const handleSelect = (tx: SearchResult) => {
        const exists = selected.find(s => s.t_id === tx.t_id)
        if (exists) {
            setSelected(selected.filter(s => s.t_id !== tx.t_id))
        } else {
            setSelected([...selected, tx])
        }
    }

    const handleSave = useCallback(async () => {
        if (selected.length === 0) return
        setIsSaving(true)
        setError(null)
        setSaveSuccess(false)
        try {
            const assignments = selected.map(openTx => ({
                close_t_id: lot.saleTransactionId,
                open_t_id: openTx.t_id,
                symbol: lot.symbol,
                quantity: Math.abs(openTx.t_qty),
                purchase_date: openTx.t_date,
                cost_basis: Math.abs(Number(openTx.t_amt) || (Number(openTx.t_price) * Math.abs(openTx.t_qty))),
                sale_date: lot.dateSold,
                proceeds: (lot.proceeds / lot.quantity) * Math.abs(openTx.t_qty),
            }))
            await fetchWrapper.post('/api/finance/lots/save-assignment', { assignments })
            setSaveSuccess(true)
            if (onAssignmentSaved) onAssignmentSaved()
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to save lot assignment')
        } finally {
            setIsSaving(false)
        }
    }, [selected, lot, onAssignmentSaved])

    // Trigger search when dialog opens
    const handleOpenChange = (open: boolean) => {
        if (open) {
            handleSearch()
        } else {
            onClose()
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Find Opening Transaction for {lot.description}</DialogTitle>
                </DialogHeader>

                <div className="text-sm text-muted-foreground mb-2">
                    <p>Sale: {lot.dateSold} — {lot.description} — Proceeds: {currency(lot.proceeds).format()}</p>
                    <p>Search for the buy transaction(s) that opened this position. Select one or more to match.</p>
                    <p className="mt-1">
                        Selected: <strong>{totalSelectedQty}</strong> of <strong>{targetQty}</strong> shares needed
                        {totalSelectedQty >= targetQty && <span className="text-green-600 ml-2">✓ Fully matched</span>}
                    </p>
                </div>

                {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
                {saveSuccess && <div className="text-green-600 text-sm mb-2">✓ Lot assignment saved to database.</div>}

                <div className="flex-1 overflow-auto border rounded-md">
                    {isSearching ? (
                        <div className="flex justify-center py-8"><Spinner /></div>
                    ) : results.length === 0 ? (
                        <div className="p-8 text-center text-muted-foreground">
                            <p>No matching buy transactions found for {lot.symbol}.</p>
                            <p className="text-xs mt-2">
                                Try importing transactions from earlier years, or check that the symbol matches exactly.
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-10"></TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Price</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {results.map(tx => {
                                    const isSelected = selected.some(s => s.t_id === tx.t_id)
                                    return (
                                        <TableRow
                                            key={tx.t_id}
                                            className={isSelected ? 'bg-blue-50 dark:bg-blue-950/30' : 'cursor-pointer hover:bg-muted/50'}
                                            onClick={() => handleSelect(tx)}
                                        >
                                            <TableCell>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => handleSelect(tx)}
                                                    className="h-4 w-4"
                                                />
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap text-sm">{tx.t_date}</TableCell>
                                            <TableCell className="text-sm">{tx.acct_name || `Acct #${tx.t_account}`}</TableCell>
                                            <TableCell className="text-sm">{tx.t_type}</TableCell>
                                            <TableCell className="text-sm max-w-[200px] truncate" title={tx.t_description}>
                                                {tx.t_description}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">{Math.abs(tx.t_qty)}</TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {tx.t_price ? currency(tx.t_price).format() : '—'}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {currency(tx.t_amt).format()}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </div>

                <DialogFooter className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={handleSearch} disabled={isSearching}>
                        {isSearching ? 'Searching…' : 'Refresh'}
                    </Button>
                    <div className="flex-1" />
                    <Button
                        onClick={handleSave}
                        disabled={selected.length === 0 || isSaving || saveSuccess}
                    >
                        {isSaving ? 'Saving…' : `Save ${selected.length} Match${selected.length !== 1 ? 'es' : ''}`}
                    </Button>
                    <Button variant="outline" onClick={onClose}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
