'use client'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import {
    analyzeLots,
    computeSummary,
    type LotSale,
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
}

export default function LotAnalyzer({ transactions, accountMap }: LotAnalyzerProps) {
    const [includeOptions, setIncludeOptions] = useState(false)
    const [showShortTermOnly, setShowShortTermOnly] = useState(false)
    const [showAccountNames, setShowAccountNames] = useState(false)

    const options: WashSaleOptions = useMemo(() => ({
        includeOptions,
    }), [includeOptions])

    const lots = useMemo(() => analyzeLots(transactions, options, accountMap), [transactions, options, accountMap])
    const summary = useMemo(() => computeSummary(lots), [lots])

    const filteredLots = useMemo(() => {
        if (showShortTermOnly) return lots.filter(l => l.isShortTerm)
        return lots
    }, [lots, showShortTermOnly])

    const shortTermLots = useMemo(() => lots.filter(l => l.isShortTerm), [lots])
    const longTermLots = useMemo(() => lots.filter(l => !l.isShortTerm), [lots])

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
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            <Switch
                                id="include-options"
                                checked={includeOptions}
                                onCheckedChange={setIncludeOptions}
                            />
                            <Label htmlFor="include-options" className="text-sm cursor-pointer">
                                Treat stock options as substantially similar to underlying stock
                            </Label>
                        </div>
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
                </CardContent>
            </Card>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Total Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold">{summary.totalSales}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">ST Gain/(Loss)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-lg font-semibold ${(summary.shortTermGain + summary.shortTermLoss) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(summary.shortTermGain + summary.shortTermLoss)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">LT Gain/(Loss)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-lg font-semibold ${(summary.longTermGain + summary.longTermLoss) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(summary.longTermGain + summary.longTermLoss)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Net Gain/(Loss)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className={`text-lg font-semibold ${summary.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(summary.totalGainLoss)}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Wash Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold text-orange-600">{summary.washSaleCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Disallowed Loss</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-lg font-semibold text-orange-600">
                            {formatCurrency(summary.totalWashSaleDisallowed)}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* IRS Form 8949 Table */}
            <Form8949Table
                title="Part I — Short-Term (held one year or less)"
                lots={showShortTermOnly ? filteredLots : shortTermLots}
                showAccountNames={showAccountNames}
            />

            {!showShortTermOnly && (
                <Form8949Table
                    title="Part II — Long-Term (held more than one year)"
                    lots={longTermLots}
                    showAccountNames={showAccountNames}
                />
            )}
        </div>
    )
}

function Form8949Table({ title, lots, showAccountNames }: { title: string; lots: LotSale[]; showAccountNames: boolean }) {
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
                                const accountNameSuffix = showAccountNames && lot.accountName 
                                    ? ` [${lot.accountName.split(' ')[0]}]` 
                                    : ''
                                    
                                return (
                                    <TableRow
                                        key={`${lot.saleTransactionId ?? i}-${lot.dateSold}-${lot.accountId}`}
                                        className={lot.isWashSale ? 'bg-orange-50 dark:bg-orange-950/30' : ''}
                                    >
                                        <TableCell className="font-mono text-sm whitespace-nowrap">
                                            {lot.description}{accountNameSuffix}
                                            {lot.isShortSale && (
                                                <Badge variant="outline" className="ml-1 text-xs">Short</Badge>
                                            )}
                                            {lot.isWashSale && (
                                                <Badge variant="destructive" className="ml-1 text-xs">Wash</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-sm whitespace-nowrap">
                                            <VariousTransactionsModal lot={lot} />
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
