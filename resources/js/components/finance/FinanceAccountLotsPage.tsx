'use client'

import { AlertTriangle, Search, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'
import { analyzeShortDividends } from '@/lib/finance/shortDividendAnalysis'
import type { LotWorkspaceResponse } from '@/types/finance/normalized-lot'

import ImportLotsPanel from './lots/ImportLotsPanel'
import LotAnalyzer from './lots/LotAnalyzer'
import { LotFilters, type LotFilterValues, LotSummaryCards, LotWorkspaceTable } from './lots/shared'
import { ShortDividendSummaryCard } from './ShortDividendDetailModal'

const DEFAULT_FILTERS: LotFilterValues = {
    status: 'open',
    source: '',
    reconciliationState: '',
    symbol: '',
    cusip: '',
    dateFrom: '',
    dateTo: '',
}

export default function FinanceAccountLotsPage({ id }: { id: number }) {
    const [filters, setFilters] = useState<LotFilterValues>(DEFAULT_FILTERS)
    const [selectedYear, setSelectedYear] = useState<string>('')
    const [data, setData] = useState<LotWorkspaceResponse | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [showImport, setShowImport] = useState(false)
    const [showLotAnalyzer, setShowLotAnalyzer] = useState(false)
    const [transactions, setTransactions] = useState<AccountLineItem[]>([])
    const [loadingTransactions, setLoadingTransactions] = useState(false)

    const fetchLots = useCallback(async () => {
        setIsLoading(true)
        try {
            const params = new URLSearchParams({
                account_ids: String(id),
                status: filters.status,
                per_page: '200',
            })

            if (filters.status === 'closed' && selectedYear) {
                params.set('year', selectedYear)
            }
            if (filters.source) {
                params.set('source', filters.source)
            }
            if (filters.reconciliationState) {
                params.set('reconciliation_state', filters.reconciliationState)
            }
            if (filters.symbol) {
                params.set('symbol', filters.symbol)
            }
            if (filters.cusip) {
                params.set('cusip', filters.cusip)
            }
            if (filters.dateFrom) {
                params.set('date_from', filters.dateFrom)
            }
            if (filters.dateTo) {
                params.set('date_to', filters.dateTo)
            }

            const response = await fetchWrapper.get(`/api/finance/lot-workspace?${params.toString()}`) as LotWorkspaceResponse
            setData(response)

            if (filters.status === 'closed' && !selectedYear && response.closed_years.length > 0) {
                setSelectedYear(String(response.closed_years[0]))
            }
        } catch (error) {
            console.error('Error fetching lots:', error)
            setData({
                data: [],
                summary: {
                    total_proceeds: 0,
                    total_basis: 0,
                    total_wash_sale: 0,
                    total_realized_gain: 0,
                    count: 0,
                    counts_by_source: {},
                    counts_by_state: {},
                    term_breakdown: {
                        short: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
                        long: { proceeds: 0, basis: 0, realized_gain: 0, count: 0 },
                    },
                },
                closed_years: [],
                meta: {
                    current_page: 1,
                    last_page: 1,
                    per_page: 200,
                    total: 0,
                },
            })
        } finally {
            setIsLoading(false)
        }
    }, [id, filters, selectedYear])

    useEffect(() => {
        void fetchLots()
    }, [fetchLots])

    const handleStatusChange = (newStatus: string) => {
        const status = newStatus as LotFilterValues['status']
        setFilters((current) => ({ ...current, status }))
        if (status !== 'closed') {
            setSelectedYear('')
        }
    }

    const handleToggleLotAnalyzer = async () => {
        if (!showLotAnalyzer && transactions.length === 0) {
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

    const shortDivSummary = useMemo(
        () => (transactions.length > 0 ? analyzeShortDividends(transactions) : null),
        [transactions],
    )

    /**
     * A lot is "missing its expected reconciliation link" when its latest link
     * state is broker_only or account_only — meaning the matched counterpart
     * lot couldn't be located, so the row appears in only one side of the
     * broker-vs-account ledger reconciliation.
     */
    const missingLinkCount = useMemo(() => {
        const lots = data?.data ?? []
        return lots.filter(
            (lot) => lot.reconciliation_state === 'broker_only' || lot.reconciliation_state === 'account_only',
        ).length
    }, [data])

    if (isLoading && !data) {
        return (
            <div className="space-y-2 px-8 pt-8">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                ))}
            </div>
        )
    }

    const lots = data?.data ?? []
    const summary = data?.summary
    const closedYears = data?.closed_years ?? []

    if (showImport) {
        return (
            <div className="px-8 pb-8">
                <ImportLotsPanel
                    accountId={id}
                    onImportComplete={() => {
                        setShowImport(false)
                        void fetchLots()
                    }}
                    onCancel={() => setShowImport(false)}
                />
            </div>
        )
    }

    return (
        <div className="space-y-6 px-8 pb-8">
            <div className="flex flex-wrap items-center gap-4">
                <Tabs value={filters.status} onValueChange={handleStatusChange}>
                    <TabsList>
                        <TabsTrigger value="open">Open Lots</TabsTrigger>
                        <TabsTrigger value="closed">Closed Lots</TabsTrigger>
                    </TabsList>
                </Tabs>

                {filters.status === 'closed' && closedYears.length > 0 && (
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

                <Button variant="outline" className="gap-1.5" onClick={() => setShowImport(true)}>
                    <Upload className="h-3.5 w-3.5" />
                    Import Lots
                </Button>

                <Button
                    variant={showLotAnalyzer ? 'default' : 'outline'}
                    className="gap-1.5"
                    onClick={() => void handleToggleLotAnalyzer()}
                    disabled={loadingTransactions}
                >
                    <Search className="h-3.5 w-3.5" />
                    {loadingTransactions ? 'Loading...' : showLotAnalyzer ? 'Hide Lot Analyzer' : 'Lot Analyzer'}
                </Button>

                {isLoading && <Skeleton className="h-4 w-16 rounded" />}
            </div>

            <LotFilters
                value={filters}
                onChange={setFilters}
                onReset={() => setFilters({ ...DEFAULT_FILTERS, status: filters.status })}
            />

            {shortDivSummary && shortDivSummary.entries.length > 0 && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Short Dividend Holding Period Analysis</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">
                            Dividends charged on short positions, classified by IRS holding period rules (IRS Pub. 550).
                            Click a row to see supporting transactions.
                        </p>
                    </CardHeader>
                    <CardContent>
                        <ShortDividendSummaryCard summary={shortDivSummary} />
                    </CardContent>
                </Card>
            )}

            {showLotAnalyzer && transactions.length > 0 && (
                <LotAnalyzer
                    transactions={transactions}
                    accountId={id}
                    allYearsLoaded={true}
                />
            )}

            {missingLinkCount > 0 && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Missing reconciliation link</AlertTitle>
                    <AlertDescription>
                        {missingLinkCount} lot{missingLinkCount === 1 ? '' : 's'} {missingLinkCount === 1 ? 'is' : 'are'} flagged
                        as broker-only or account-only — the matched counterpart lot could not be located.
                        Review these in the reconciliation workspace before filing.
                    </AlertDescription>
                </Alert>
            )}

            {summary && <LotSummaryCards summary={summary} showTermBreakdown={filters.status === 'closed'} />}

            {lots.length === 0 ? (
                <div className="rounded-lg bg-muted p-8 text-center">
                    <h2 className="mb-4 text-xl font-semibold">
                        {filters.status === 'open' ? 'No Open Lots' : 'No Closed Lots'}
                    </h2>
                    <p className="mb-6">
                        {filters.status === 'open'
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
                    <LotWorkspaceTable
                        lots={lots}
                        showDescription
                        showTerm={filters.status === 'closed'}
                        showReconciliation
                        showSourceDocument
                        showTransactionLinks
                        showActions
                    />
                </div>
            )}
        </div>
    )
}
