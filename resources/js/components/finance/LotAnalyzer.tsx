'use client'
import { useCallback, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { downloadTxf } from '@/lib/finance/txfExport'
import {
    analyzeLots,
    computeSummary,
    type LotSale,
    WASH_SALE_METHOD_1,
    WASH_SALE_METHOD_2,
    type WashSaleOptions,
} from '@/lib/finance/washSaleEngine'

import { VariousTransactionsModal } from './VariousTransactionsModal'

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

interface LotAnalyzerProps {
    transactions: AccountLineItem[]
    accountMap?: Map<number, string>
    /** When set, enables the "Save to Database" workflow for this account */
    accountId?: number
    /** Called when user wants to reload with all years of data */
    onLoadAllYears?: () => void
}

export default function LotAnalyzer({ transactions, accountMap, accountId, onLoadAllYears }: LotAnalyzerProps) {
    const [options, setOptions] = useState<WashSaleOptions>({ ...WASH_SALE_METHOD_1 })
    const [showShortTermOnly, setShowShortTermOnly] = useState(false)
    const [showAccountNames, setShowAccountNames] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
    const [selectedYear, setSelectedYear] = useState<string>('all')

    const lots = useMemo(() => analyzeLots(transactions, options, accountMap), [transactions, options, accountMap])
    const summary = useMemo(() => computeSummary(lots), [lots])

    // Extract available sale years from lots
    const saleYears = useMemo(() => {
        const years = new Set<string>()
        lots.forEach(lot => {
            if (lot.dateSold) {
                const year = lot.dateSold.split('-')[0]
                if (year) years.add(year)
            }
        })
        return Array.from(years).sort().reverse()
    }, [lots])

    // Filter lots by selected year
    const yearFilteredLots = useMemo(() => {
        if (selectedYear === 'all') return lots
        return lots.filter(l => l.dateSold && l.dateSold.startsWith(selectedYear))
    }, [lots, selectedYear])

    const yearSummary = useMemo(() => computeSummary(yearFilteredLots), [yearFilteredLots])

    const filteredLots = useMemo(() => {
        if (showShortTermOnly) return yearFilteredLots.filter(l => l.isShortTerm)
        return yearFilteredLots
    }, [yearFilteredLots, showShortTermOnly])

    const shortTermLots = useMemo(() => yearFilteredLots.filter(l => l.isShortTerm), [yearFilteredLots])
    const longTermLots = useMemo(() => yearFilteredLots.filter(l => !l.isShortTerm), [yearFilteredLots])

    const handleSave = useCallback(async () => {
        if (!accountId) return
        setIsSaving(true)
        setSaveResult(null)
        try {
            const payload = lots.flatMap(lot => {
                // Each lot sale can have multiple acquired transactions (FIFO splits)
                if (lot.acquiredTransactions && lot.acquiredTransactions.length > 0) {
                    return lot.acquiredTransactions.map(at => ({
                        symbol: lot.symbol,
                        description: lot.description,
                        quantity: at.qty,
                        purchase_date: at.date,
                        cost_basis: at.price * at.qty,
                        sale_date: lot.dateSold,
                        proceeds: (lot.proceeds / lot.quantity) * at.qty,
                        realized_gain_loss: ((lot.proceeds / lot.quantity) * at.qty) - (at.price * at.qty),
                        is_short_term: lot.isShortTerm,
                        open_t_id: at.id ?? null,
                        close_t_id: lot.saleTransactionId ?? null,
                    }))
                }
                // Unmatched sale – no opening transaction
                return [{
                    symbol: lot.symbol,
                    description: lot.description,
                    quantity: lot.quantity,
                    purchase_date: lot.dateAcquired ?? lot.dateSold,
                    cost_basis: lot.costBasis,
                    sale_date: lot.dateSold,
                    proceeds: lot.proceeds,
                    realized_gain_loss: lot.gainOrLoss,
                    is_short_term: lot.isShortTerm,
                    open_t_id: null,
                    close_t_id: lot.saleTransactionId ?? null,
                }]
            })
            await fetchWrapper.post(`/api/finance/${accountId}/lots/save-analyzed`, { lots: payload })
            setSaveResult({ success: true, message: `Saved ${payload.length} lot(s) to database.` })
        } catch (err: any) {
            setSaveResult({ success: false, message: err?.message || 'Failed to save lots.' })
        } finally {
            setIsSaving(false)
        }
    }, [accountId, lots])

    if (lots.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Lot Analyzer</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">
                        No buy/sell transactions found to analyze. The Lot Analyzer requires transactions with
                        a symbol and type (Buy/Sell) to match sales with purchases and detect wash sales.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-6">
            {/* Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        Lot Analyzer
                        <Badge variant="outline" className="text-xs">IRS Form 8949</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {/* Method presets */}
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-muted-foreground">Preset:</span>
                            <Button
                                variant={JSON.stringify(options) === JSON.stringify(WASH_SALE_METHOD_1) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setOptions({ ...WASH_SALE_METHOD_1 })}
                            >
                                Method 1 – Same Underlying
                            </Button>
                            <Button
                                variant={JSON.stringify(options) === JSON.stringify(WASH_SALE_METHOD_2) ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setOptions({ ...WASH_SALE_METHOD_2 })}
                            >
                                Method 2 – Identical Ticker
                            </Button>
                        </div>

                        {/* Individual settings */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="adjust-same-underlying"
                                    checked={options.adjustSameUnderlying}
                                    onCheckedChange={(v) => {
                                        const next = { ...options, adjustSameUnderlying: v }
                                        if (!v) { next.adjustStockToOption = false; next.adjustOptionToStock = false }
                                        setOptions(next)
                                    }}
                                />
                                <Label htmlFor="adjust-same-underlying" className="text-sm cursor-pointer">
                                    Wash sales between trades for same underlying ticker
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="adjust-short-long"
                                    checked={options.adjustShortLong}
                                    onCheckedChange={(v) => setOptions({ ...options, adjustShortLong: v })}
                                />
                                <Label htmlFor="adjust-short-long" className="text-sm cursor-pointer">
                                    Wash sales between shorts and longs
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="adjust-stock-to-option"
                                    checked={options.adjustStockToOption}
                                    disabled={!options.adjustSameUnderlying}
                                    onCheckedChange={(v) => setOptions({ ...options, adjustStockToOption: v })}
                                />
                                <Label htmlFor="adjust-stock-to-option" className={`text-sm cursor-pointer ${!options.adjustSameUnderlying ? 'opacity-50' : ''}`}>
                                    Wash sales from stock to option positions
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="adjust-option-to-stock"
                                    checked={options.adjustOptionToStock}
                                    disabled={!options.adjustSameUnderlying}
                                    onCheckedChange={(v) => setOptions({ ...options, adjustOptionToStock: v })}
                                />
                                <Label htmlFor="adjust-option-to-stock" className={`text-sm cursor-pointer ${!options.adjustSameUnderlying ? 'opacity-50' : ''}`}>
                                    Wash sales from options to stock positions
                                </Label>
                            </div>
                        </div>

                        {/* Display / filter settings */}
                        <div className="flex flex-wrap items-center gap-6 pt-2 border-t">
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="short-term-only"
                                    checked={showShortTermOnly}
                                    onCheckedChange={setShowShortTermOnly}
                                />
                                <Label htmlFor="short-term-only" className="text-sm cursor-pointer">
                                    Show short-term only
                                </Label>
                            </div>
                            <div className="flex items-center gap-2">
                                <Switch
                                    id="show-accounts"
                                    checked={showAccountNames}
                                    onCheckedChange={setShowAccountNames}
                                />
                                <Label htmlFor="show-accounts" className="text-sm cursor-pointer">
                                    Show account names
                                </Label>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Year Tabs */}
            {saleYears.length > 1 && (
                <Tabs value={selectedYear} onValueChange={setSelectedYear}>
                    <TabsList>
                        <TabsTrigger value="all">All Years</TabsTrigger>
                        {saleYears.map(year => (
                            <TabsTrigger key={year} value={year}>{year}</TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Total Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold">{yearSummary.totalSales}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">ST Gain/(Loss)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-lg font-semibold ${(yearSummary.shortTermGain + yearSummary.shortTermLoss) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(yearSummary.shortTermGain + yearSummary.shortTermLoss)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">LT Gain/(Loss)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-lg font-semibold ${(yearSummary.longTermGain + yearSummary.longTermLoss) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(yearSummary.longTermGain + yearSummary.longTermLoss)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Net Gain/(Loss)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-lg font-semibold ${yearSummary.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(yearSummary.totalGainLoss)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Wash Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold text-orange-600">{yearSummary.washSaleCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Disallowed Loss</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold text-orange-600">
                            {formatCurrency(yearSummary.totalWashSaleDisallowed)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Action buttons row */}
            <div className="flex items-center gap-3 flex-wrap">
                {/* Save to database (only for single-account view) */}
                {accountId && (
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || lots.length === 0}
                    >
                        {isSaving ? 'Saving…' : 'Save Lots to Database'}
                    </Button>
                )}
                <Button
                    variant="outline"
                    onClick={() => downloadTxf(yearFilteredLots, selectedYear)}
                    disabled={yearFilteredLots.length === 0}
                >
                    Save as TXF File
                </Button>
                {saveResult && (
                    <span className={`text-sm ${saveResult.success ? 'text-green-600' : 'text-red-600'}`}>
                        {saveResult.message}
                    </span>
                )}
            </div>

            {/* IRS Form 8949 Table */}
            <Form8949Table
                title="Part I — Short-Term (held one year or less)"
                lots={showShortTermOnly ? filteredLots : shortTermLots}
                showAccountNames={showAccountNames}
                onLoadAllYears={onLoadAllYears}
            />

            {!showShortTermOnly && (
                <Form8949Table
                    title="Part II — Long-Term (held more than one year)"
                    lots={longTermLots}
                    showAccountNames={showAccountNames}
                    onLoadAllYears={onLoadAllYears}
                />
            )}
        </div>
    )
}

function Form8949Table({ title, lots, showAccountNames, onLoadAllYears }: { title: string; lots: LotSale[]; showAccountNames: boolean; onLoadAllYears?: () => void }) {
    if (lots.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">{title}</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground text-sm">No transactions in this category.</p>
                </CardContent>
            </Card>
        )
    }

    const totals = lots.reduce(
        (acc, lot) => ({
            proceeds: acc.proceeds + lot.proceeds,
            costBasis: acc.costBasis + lot.costBasis,
            adjustmentAmount: acc.adjustmentAmount + lot.adjustmentAmount,
            gainOrLoss: acc.gainOrLoss + lot.gainOrLoss,
        }),
        { proceeds: 0, costBasis: 0, adjustmentAmount: 0, gainOrLoss: 0 }
    )

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="rounded-md border overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="min-w-[300px] whitespace-nowrap">
                                    (a) Description of property
                                </TableHead>
                                <TableHead className="whitespace-nowrap">(b) Date acquired</TableHead>
                                <TableHead className="whitespace-nowrap">(c) Date sold</TableHead>
                                <TableHead className="text-right whitespace-nowrap">(d) Proceeds</TableHead>
                                <TableHead className="text-right whitespace-nowrap">(e) Cost basis</TableHead>
                                <TableHead className="text-center whitespace-nowrap">(f) Code</TableHead>
                                <TableHead className="text-right whitespace-nowrap">(g) Adjustment</TableHead>
                                <TableHead className="text-right whitespace-nowrap">(h) Gain or (loss)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lots.map((lot, i) => {
                                const accountBadgeLabel = showAccountNames && lot.accountName 
                                    ? lot.accountName.split(' ')[0] 
                                    : null
                                    
                                return (
                                    <TableRow
                                        key={`${lot.saleTransactionId ?? i}-${lot.dateSold}-${lot.accountId}`}
                                        className={lot.isWashSale ? 'bg-orange-50 dark:bg-orange-950/30' : ''}
                                    >
                                        <TableCell className="font-mono text-sm whitespace-nowrap">
                                            {lot.description}
                                            {accountBadgeLabel && (
                                                <Badge variant="outline" className="ml-1 text-xs font-sans uppercase tracking-tight opacity-70">
                                                    {accountBadgeLabel}
                                                </Badge>
                                            )}
                                            {lot.isShortSale && (
                                                <Badge variant="outline" className="ml-1 text-xs font-sans uppercase tracking-tight border-blue-500 text-blue-600 dark:text-blue-400">
                                                    Short
                                                </Badge>
                                            )}
                                            {lot.isWashSale && (
                                                <Badge variant="destructive" className="ml-1 text-xs font-sans uppercase tracking-tight">
                                                    Wash
                                                </Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm whitespace-nowrap">
                                            <VariousTransactionsModal lot={lot} onLoadAllYears={onLoadAllYears} />
                                        </TableCell>
                                        <TableCell className="text-sm whitespace-nowrap">{formatDate(lot.dateSold)}</TableCell>
                                        <TableCell className="text-right font-mono text-sm whitespace-nowrap">{formatCurrency(lot.proceeds)}</TableCell>
                                        <TableCell className="text-right font-mono text-sm whitespace-nowrap">{formatCurrency(lot.costBasis)}</TableCell>
                                        <TableCell className="text-center font-mono text-sm whitespace-nowrap">{lot.adjustmentCode}</TableCell>
                                        <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                                            {lot.adjustmentAmount !== 0 ? formatCurrency(lot.adjustmentAmount) : ''}
                                        </TableCell>
                                        <TableCell className={`text-right font-mono text-sm whitespace-nowrap ${lot.gainOrLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatCurrency(lot.gainOrLoss)}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {/* Totals row */}
                            <TableRow className="font-semibold bg-muted/50">
                                <TableCell colSpan={3} className="whitespace-nowrap">Totals</TableCell>
                                <TableCell className="text-right font-mono whitespace-nowrap">{formatCurrency(totals.proceeds)}</TableCell>
                                <TableCell className="text-right font-mono whitespace-nowrap">{formatCurrency(totals.costBasis)}</TableCell>
                                <TableCell className="whitespace-nowrap"></TableCell>
                                <TableCell className="text-right font-mono whitespace-nowrap">
                                    {totals.adjustmentAmount !== 0 ? formatCurrency(totals.adjustmentAmount) : ''}
                                </TableCell>
                                <TableCell className={`text-right font-mono whitespace-nowrap ${totals.gainOrLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatCurrency(totals.gainOrLoss)}
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    )
}
