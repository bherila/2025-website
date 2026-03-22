'use client'
import { useCallback, useEffect, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { fetchWrapper } from '@/fetchWrapper'
import { parseFidelityLotsTsv } from '@/lib/parseFidelityLots'
import type { LotImportRow, TransactionMatch } from '@/types/finance/lot'

interface Props {
    accountId: number
    onImportComplete: () => void
    onCancel: () => void
}

function formatCurrency(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—'
    return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—'
    try {
        const d = new Date(dateStr + 'T00:00:00')
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch {
        return dateStr
    }
}

export default function ImportLotsPanel({ accountId, onImportComplete, onCancel }: Props) {
    const [tsvText, setTsvText] = useState('')
    const [symbol, setSymbol] = useState('')
    const [parseError, setParseError] = useState<string | null>(null)
    const [importRows, setImportRows] = useState<LotImportRow[]>([])
    const [transactions, setTransactions] = useState<TransactionMatch[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [isImporting, setIsImporting] = useState(false)
    const [importResult, setImportResult] = useState<{ created: number; updated: number } | null>(null)
    const [step, setStep] = useState<'paste' | 'match' | 'done'>('paste')

    const searchTransactions = useCallback(async (dates: string[]) => {
        setIsSearching(true)
        try {
            const response = await fetchWrapper.post(
                `/api/finance/${accountId}/lots/search-transactions`,
                { dates }
            ) as { transactions: TransactionMatch[] }
            setTransactions(response.transactions)
        } catch (e: any) {
            setParseError('Failed to search transactions: ' + (e.message || ''))
        } finally {
            setIsSearching(false)
        }
    }, [accountId])

    const handleParse = useCallback(() => {
        setParseError(null)
        try {
            const { description, rows } = parseFidelityLotsTsv(tsvText)
            if (!symbol.trim()) {
                setParseError('Please enter the ticker symbol')
                return
            }
            const lotRows: LotImportRow[] = rows.map(r => ({
                ...r,
                symbol: symbol.trim().toUpperCase(),
                description,
                openTId: null,
                closeTId: null,
                openTIdMatched: false,
                closeTIdMatched: false,
                isDuplicate: false,
            }))
            setImportRows(lotRows)
            setStep('match')

            // Collect all unique dates
            const dates = new Set<string>()
            for (const row of lotRows) {
                dates.add(row.acquired)
                if (row.dateSold) dates.add(row.dateSold)
            }
            searchTransactions(Array.from(dates))
        } catch (e: any) {
            setParseError(e.message || 'Failed to parse TSV data')
        }
    }, [tsvText, symbol, searchTransactions])

    // Auto-match transactions when they load
    useEffect(() => {
        if (transactions.length === 0 || importRows.length === 0) return

        setImportRows(prev => prev.map(row => {
            let openTId = row.openTId
            let closeTId = row.closeTId

            // Try to auto-match buy transaction by date
            if (!openTId) {
                const buyMatches = transactions.filter(t =>
                    t.t_date === row.acquired &&
                    t.t_symbol?.toUpperCase() === row.symbol.toUpperCase()
                )
                if (buyMatches.length === 1) {
                    openTId = buyMatches[0]!.t_id
                }
            }

            // Try to auto-match sell transaction by date
            if (!closeTId && row.dateSold) {
                const sellMatches = transactions.filter(t =>
                    t.t_date === row.dateSold &&
                    t.t_symbol?.toUpperCase() === row.symbol.toUpperCase()
                )
                if (sellMatches.length === 1) {
                    closeTId = sellMatches[0]!.t_id
                }
            }

            return {
                ...row,
                openTId,
                closeTId,
                openTIdMatched: openTId !== null,
                closeTIdMatched: closeTId !== null || row.dateSold === null,
            }
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transactions])

    const handleTransactionSelect = (rowIdx: number, field: 'openTId' | 'closeTId', value: string) => {
        const tId = value === '' ? null : parseInt(value)
        setImportRows(prev => prev.map((row, i) => {
            if (i !== rowIdx) return row
            const updated = { ...row, [field]: tId }
            updated.openTIdMatched = updated.openTId !== null
            updated.closeTIdMatched = updated.closeTId !== null || row.dateSold === null
            return updated
        }))
    }

    const allMatched = importRows.every(r => r.openTIdMatched && r.closeTIdMatched)

    const handleImport = async () => {
        setIsImporting(true)
        setParseError(null)
        try {
            const lots = importRows.map(r => ({
                symbol: r.symbol,
                description: r.description,
                quantity: r.quantity,
                purchase_date: r.acquired,
                cost_basis: r.costBasis,
                cost_per_unit: r.costBasisPerShare,
                sale_date: r.dateSold,
                proceeds: r.proceeds,
                realized_gain_loss: r.shortTermGainLoss !== null ? r.shortTermGainLoss : r.longTermGainLoss,
                is_short_term: r.shortTermGainLoss !== null ? true : (r.longTermGainLoss !== null ? false : null),
                open_t_id: r.openTId,
                close_t_id: r.closeTId,
            }))

            const result = await fetchWrapper.post(
                `/api/finance/${accountId}/lots/import`,
                { lots }
            ) as { success: boolean; created: number; updated: number }

            setImportResult({ created: result.created, updated: result.updated })
            setStep('done')
        } catch (e: any) {
            setParseError('Failed to import lots: ' + (e.message || ''))
        } finally {
            setIsImporting(false)
        }
    }

    if (step === 'done' && importResult) {
        return (
            <div className="space-y-4">
                <Alert>
                    <AlertTitle>Import Complete</AlertTitle>
                    <AlertDescription>
                        {importResult.created} lot(s) created, {importResult.updated} lot(s) updated.
                    </AlertDescription>
                </Alert>
                <Button onClick={onImportComplete}>Done</Button>
            </div>
        )
    }

    if (step === 'paste') {
        return (
            <div className="space-y-4">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg font-semibold">Import Lots (Fidelity TSV Format)</h3>
                    <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-sm font-medium mb-1 block">Ticker Symbol</label>
                        <Input
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                            placeholder="e.g. ARKG"
                            className="uppercase"
                        />
                    </div>
                </div>
                <div>
                    <label className="text-sm font-medium mb-1 block">
                        Paste Fidelity lot data (including the description header line)
                    </label>
                    <Textarea
                        value={tsvText}
                        onChange={(e) => setTsvText(e.target.value)}
                        rows={12}
                        placeholder={`ISHARES TR GENOMICS IMMUN\nAcquired\tDate Sold\tQuantity\tCost Basis\t...\nDec-19-2024\tMay-06-2025\t0.101\t$2.25\t...`}
                        className="font-mono text-xs"
                    />
                </div>
                {parseError && (
                    <Alert variant="destructive">
                        <AlertDescription>{parseError}</AlertDescription>
                    </Alert>
                )}
                <Button onClick={handleParse} disabled={!tsvText.trim() || !symbol.trim()}>
                    Parse & Match Transactions
                </Button>
            </div>
        )
    }

    // Step: match
    const getTransactionsForDate = (date: string) =>
        transactions.filter(t => t.t_date === date)

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4">
                <h3 className="text-lg font-semibold">
                    Match Transactions — {symbol.toUpperCase()} ({importRows.length} lots)
                </h3>
                <Button variant="outline" size="sm" onClick={() => setStep('paste')}>Back</Button>
                <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
            </div>

            {isSearching && (
                <div className="flex items-center gap-2">
                    <Spinner className="h-4 w-4" />
                    <span>Searching transactions...</span>
                </div>
            )}

            {parseError && (
                <Alert variant="destructive">
                    <AlertDescription>{parseError}</AlertDescription>
                </Alert>
            )}

            <div className="rounded-md border overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Acquired</TableHead>
                            <TableHead>Date Sold</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Cost Basis</TableHead>
                            <TableHead className="text-right">Proceeds</TableHead>
                            <TableHead className="text-right">Gain/Loss</TableHead>
                            <TableHead>Buy Transaction</TableHead>
                            <TableHead>Sell Transaction</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {importRows.map((row, idx) => {
                            const gainLoss = row.shortTermGainLoss ?? row.longTermGainLoss
                            const buyOptions = getTransactionsForDate(row.acquired)
                            const sellOptions = row.dateSold ? getTransactionsForDate(row.dateSold) : []
                            return (
                                <TableRow key={idx}>
                                    <TableCell>{formatDate(row.acquired)}</TableCell>
                                    <TableCell>{formatDate(row.dateSold)}</TableCell>
                                    <TableCell className="text-right font-mono">{row.quantity}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(row.costBasis)}</TableCell>
                                    <TableCell className="text-right font-mono">{formatCurrency(row.proceeds)}</TableCell>
                                    <TableCell className={`text-right font-mono ${gainLoss !== null && gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(gainLoss)}
                                        {row.shortTermGainLoss !== null && <Badge variant="secondary" className="ml-1 text-xs">ST</Badge>}
                                        {row.longTermGainLoss !== null && <Badge variant="outline" className="ml-1 text-xs">LT</Badge>}
                                    </TableCell>
                                    <TableCell>
                                        <Select
                                            value={row.openTId?.toString() ?? ''}
                                            onValueChange={(v) => handleTransactionSelect(idx, 'openTId', v)}
                                        >
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Select buy txn..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {buyOptions.map(t => (
                                                    <SelectItem key={t.t_id} value={t.t_id.toString()}>
                                                        #{t.t_id} {t.t_type} {t.t_description?.substring(0, 30)}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </TableCell>
                                    <TableCell>
                                        {row.dateSold ? (
                                            <Select
                                                value={row.closeTId?.toString() ?? ''}
                                                onValueChange={(v) => handleTransactionSelect(idx, 'closeTId', v)}
                                            >
                                                <SelectTrigger className="w-48">
                                                    <SelectValue placeholder="Select sell txn..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {sellOptions.map(t => (
                                                        <SelectItem key={t.t_id} value={t.t_id.toString()}>
                                                            #{t.t_id} {t.t_type} {t.t_description?.substring(0, 30)}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">Open lot</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {row.openTIdMatched && row.closeTIdMatched ? (
                                            <Badge className="bg-green-600">✓ Matched</Badge>
                                        ) : (
                                            <Badge variant="destructive">Unmatched</Badge>
                                        )}
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
            </div>

            <div className="flex items-center gap-4">
                <Button
                    onClick={handleImport}
                    disabled={!allMatched || isImporting}
                >
                    {isImporting ? <><Spinner className="h-4 w-4 mr-2" /> Importing...</> : `Import ${importRows.length} Lots`}
                </Button>
                {!allMatched && (
                    <span className="text-sm text-muted-foreground">
                        All buy/sell transactions must be matched before importing.
                    </span>
                )}
            </div>
        </div>
    )
}
