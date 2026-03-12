'use client'
import { useCallback, useEffect, useState } from 'react'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { type AccountLineItem, AccountLineItemSchema } from '@/data/finance/AccountLineItem'
import { fetchWrapper } from '@/fetchWrapper'

import FinanceSubNav from './FinanceSubNav'
import LotAnalyzer from './LotAnalyzer'
import TransactionsTable from './TransactionsTable'

export default function AllTransactionsPage() {
    const [data, setData] = useState<AccountLineItem[] | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [selectedYear, setSelectedYear] = useState<string>('all')
    const [availableYears, setAvailableYears] = useState<number[]>([])
    const [showLotAnalyzer, setShowLotAnalyzer] = useState(false)

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true)
            const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
            const fetchedData = await fetchWrapper.get(`/api/finance/all-line-items${yearParam}`)
            const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
            setData(parsedData.filter(Boolean))

            // Extract available years from data
            if (selectedYear === 'all' && parsedData.length > 0) {
                const years = [...new Set(parsedData.map(t => {
                    const d = t.t_date
                    return d ? parseInt(d.substring(0, 4), 10) : null
                }).filter((y): y is number => y !== null && !isNaN(y)))].sort((a, b) => b - a)
                setAvailableYears(years)
            }
        } catch (error) {
            console.error('Error fetching all transactions:', error)
            setData([])
        } finally {
            setIsLoading(false)
        }
    }, [selectedYear])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    return (
        <>
            <FinanceSubNav activeSection="all-transactions" />
            <div className="px-8 pb-8">
                <div className="flex items-center gap-4 mb-4">
                    <h2 className="text-xl font-semibold">All Transactions</h2>
                    <Select value={selectedYear} onValueChange={setSelectedYear}>
                        <SelectTrigger className="w-32">
                            <SelectValue placeholder="Year" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Years</SelectItem>
                            {availableYears.map((year) => (
                                <SelectItem key={year} value={String(year)}>
                                    {year}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant={showLotAnalyzer ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setShowLotAnalyzer(!showLotAnalyzer)}
                    >
                        {showLotAnalyzer ? 'Hide Lot Analyzer' : 'Lot Analyzer'}
                    </Button>
                    {isLoading && <Spinner className="h-4 w-4" />}
                </div>

                {showLotAnalyzer && data && data.length > 0 && (
                    <div className="mb-6">
                        <LotAnalyzer transactions={data} />
                    </div>
                )}

                {!isLoading && data && data.length === 0 && (
                    <div className="text-center p-8 bg-muted rounded-lg">
                        <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
                        <p className="mb-6">
                            {selectedYear === 'all'
                                ? 'No transactions found across your accounts.'
                                : `No transactions found for ${selectedYear}.`}
                        </p>
                    </div>
                )}

                {data && data.length > 0 && (
                    <TransactionsTable
                        data={data}
                        enableTagging
                    />
                )}
            </div>
        </>
    )
}
