'use client'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import type { Lot, LotsResponse } from '@/types/finance/lot'

import LotAnalyzer from './LotAnalyzer'
import ImportLotsPanel from './lots/ImportLotsPanel'

function formatCurrency(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '—'
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return '—'
    return num.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    })
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

function formatQty(value: string | null | undefined): string {
    if (value === null || value === undefined) return '—'
    const num = parseFloat(value)
    if (isNaN(num)) return '—'
    // Show up to 4 decimals, trimming trailing zeros
    return num.toLocaleString('en-US', { maximumFractionDigits: 4 })
}

export default function FinanceAccountLotsPage({ id }: { id: number }) {
    const [status, setStatus] = useState<'open' | 'closed'>('open')
    const [selectedYear, setSelectedYear] = useState<string>('')
    const [data, setData] = useState<LotsResponse | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showImport, setShowImport] = useState(false)
    const [showLotAnalyzer, setShowLotAnalyzer] = useState(false)
    const [transactions, setTransactions] = useState<AccountLineItem[]>([])
    const [loadingTransactions, setLoadingTransactions] = useState(false)

    const fetchLots = useCallback(async () => {
        setIsLoading(true)
        try {
            let url = `/api/finance/${id}/lots?status=${status}`
            if (status === 'closed' && selectedYear) {
                url += `&year=${selectedYear}`
            }
            const response = await fetchWrapper.get(url) as LotsResponse
            setData(response)

            // Auto-select most recent year for closed lots if no year selected
            if (status === 'closed' && !selectedYear && response.closedYears.length > 0) {
                setSelectedYear(String(response.closedYears[0]))
            }
        } catch (error) {
            console.error('Error fetching lots:', error)
            setData({ lots: [], summary: null, closedYears: [] })
        } finally {
            setIsLoading(false)
        }
    }, [id, status, selectedYear])

    useEffect(() => {
        fetchLots()
    }, [fetchLots])

    const handleStatusChange = (newStatus: string) => {
        setStatus(newStatus as 'open' | 'closed')
        if (newStatus === 'open') {
            setSelectedYear('')
        }
    }

    const handleToggleLotAnalyzer = async () => {
        if (!showLotAnalyzer && transactions.length === 0) {
            // Fetch all transactions for this account
            setLoadingTransactions(true)
            try {
                const fetchedData = await fetchWrapper.get(`/api/finance/${id}/line_items`)
                const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
                setTransactions(parsedData.filter(Boolean))
            } catch (error) {
                console.error('Error fetching transactions for lot analysis:', error)
            } finally {
                setLoadingTransactions(false)
            }
        }
        setShowLotAnalyzer(!showLotAnalyzer)
    }

    if (isLoading && !data) {
        return (
            <div className="space-y-2 px-8 pt-8">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                ))}
            </div>
        )
    }

    const lots = data?.lots ?? []
    const summary = data?.summary
    const closedYears = data?.closedYears ?? []

    if (showImport) {
        return (
            <div className="px-8 pb-8">
                <ImportLotsPanel
                    accountId={id}
                    onImportComplete={() => {
                        setShowImport(false)
                        fetchLots()
                    }}
                    onCancel={() => setShowImport(false)}
                />
            </div>
        )
    }

    /** Check if a lot has a missing (null) transaction link when one is expected */
    const hasMissingLink = (lot: Lot) => {
        // open_t_id should always be set for imported lots
        if (lot.lot_source && lot.lot_source !== 'manual' && lot.open_t_id === null) return true
        // close_t_id should exist for closed lots from imports
        if (lot.sale_date && lot.lot_source && lot.lot_source !== 'manual' && lot.close_t_id === null) return true
        return false
    }

    return (
        <div className="px-8 pb-8">
            {/* Controls */}
            <div className="flex items-center gap-4 mb-6">
                <Tabs value={status} onValueChange={handleStatusChange}>
                    <TabsList>
                        <TabsTrigger value="open">Open Lots</TabsTrigger>
                        <TabsTrigger value="closed">Closed Lots</TabsTrigger>
                    </TabsList>
                </Tabs>

                {status === 'closed' && closedYears.length > 0 && (
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="w-32">
                            <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                            {closedYears.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                    {year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}

                <Button variant="outline" onClick={() => setShowImport(true)}>
                    Import Lots
                </Button>

                <Button
                    variant={showLotAnalyzer ? 'default' : 'outline'}
                    onClick={handleToggleLotAnalyzer}
                    disabled={loadingTransactions}
                >
                    {loadingTransactions ? 'Loading...' : showLotAnalyzer ? 'Hide Lot Analyzer' : 'Lot Analyzer'}
                </Button>

                {isLoading && <Skeleton className="h-4 w-16 rounded" />}
            </div>

            {/* Lot Analyzer */}
            {showLotAnalyzer && transactions.length > 0 && (
                <div className="mb-6">
                    <LotAnalyzer 
                        transactions={transactions} 
                        accountId={id} 
                        allYearsLoaded={true}
                    />
                </div>
            )}

            {/* Gains/Losses Summary for closed lots */}
            {status === 'closed' && summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">ST Gains</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(summary.short_term_gains)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">ST Losses</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold text-red-600">
                                {formatCurrency(summary.short_term_losses)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">LT Gains</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold text-green-600">
                                {formatCurrency(summary.long_term_gains)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">LT Losses</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-lg font-semibold text-red-600">
                                {formatCurrency(summary.long_term_losses)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Net Realized</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className={`text-lg font-semibold ${summary.total_realized >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(summary.total_realized)}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Lots Table */}
            {lots.length === 0 ? (
                <div className="text-center p-8 bg-muted rounded-lg">
                    <h2 className="text-xl font-semibold mb-4">
                        {status === 'open' ? 'No Open Lots' : 'No Closed Lots'}
                    </h2>
                    <p className="mb-6">
                        {status === 'open'
                            ? "This account doesn't have any open lots. Import a statement to populate lot data."
                            : selectedYear
                                ? `No lots were closed in ${selectedYear}.`
                                : 'No closed lots found for this account.'}
                    </p>
                    <a href={`/finance/${id}/import-transactions`}>
                        <Button>Import Transactions</Button>
                    </a>
                </div>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Symbol</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead>Purchase Date</TableHead>
                                <TableHead className="text-right">Cost Basis</TableHead>
                                <TableHead className="text-right">Cost/Unit</TableHead>
                                {status === 'closed' && (
                                    <>
                                        <TableHead>Sale Date</TableHead>
                                        <TableHead className="text-right">Proceeds</TableHead>
                                        <TableHead className="text-right">Gain/Loss</TableHead>
                                        <TableHead>Type</TableHead>
                                    </>
                                )}
                                <TableHead>Statement</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Links</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lots.map((lot) => {
                                const gainLoss = lot.realized_gain_loss ? parseFloat(lot.realized_gain_loss) : null
                                return (
                                    <TableRow key={lot.lot_id}>
                                        <TableCell className="font-medium">{lot.symbol}</TableCell>
                                        <TableCell className="text-muted-foreground max-w-48 truncate">
                                            {lot.description || '—'}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">{formatQty(lot.quantity)}</TableCell>
                                        <TableCell>{formatDate(lot.purchase_date)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(lot.cost_basis)}</TableCell>
                                        <TableCell className="text-right font-mono">{formatCurrency(lot.cost_per_unit)}</TableCell>
                                        {status === 'closed' && (
                                            <>
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
                                            </>
                                        )}
                                        <TableCell>
                                            {lot.statement ? (
                                                <a
                                                    href={`/finance/${id}/statements?statement_id=${lot.statement.statement_id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {formatDate(lot.statement.statement_closing_date)}
                                                </a>
                                            ) : lot.lot_source === 'import' ? (
                                                <span className="text-muted-foreground italic text-xs">Statement Deleted</span>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {lot.lot_source && (
                                                <Badge variant="outline" className="text-xs">
                                                    {lot.lot_source}
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-1">
                                                {lot.open_t_id && (
                                                    <a href={`/finance/${id}#t_id=${lot.open_t_id}`} className="text-blue-600 hover:underline text-xs">
                                                        Buy #{lot.open_t_id}
                                                    </a>
                                                )}
                                                {lot.close_t_id && (
                                                    <a href={`/finance/${id}#t_id=${lot.close_t_id}`} className="text-blue-600 hover:underline text-xs">
                                                        Sell #{lot.close_t_id}
                                                    </a>
                                                )}
                                                {hasMissingLink(lot) && (
                                                    <span title="Linked transaction is missing" className="text-yellow-600">⚠️</span>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    )
}
