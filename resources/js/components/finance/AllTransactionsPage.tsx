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

type FilterType = 'all' | 'cash' | 'stock'

export default function AllTransactionsPage() {
    const [data, setData] = useState<AccountLineItem[] | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
    const [availableYears, setAvailableYears] = useState<number[]>([])
    const [showLotAnalyzer, setShowLotAnalyzer] = useState(false)
    const [filter, setFilter] = useState<FilterType>('all')

    const fetchYears = useCallback(async () => {
        try {
            const years = await fetchWrapper.get('/api/finance/all-transaction-years')
            if (Array.isArray(years)) {
                setAvailableYears(years)
                // If current year is not in available years, default to "all" or first available
                const currentYearStr = new Date().getFullYear().toString()
                if (!years.includes(parseInt(currentYearStr))) {
                    if (years.length > 0) {
                        setSelectedYear(String(years[0]))
                    } else {
                        setSelectedYear('all')
                    }
                }
            }
        } catch (error) {
            console.error('Error fetching available years:', error)
        }
    }, [])

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true)
            const yearParam = selectedYear !== 'all' ? `?year=${selectedYear}` : ''
            const fetchedData = await fetchWrapper.get(`/api/finance/all-line-items${yearParam}`)
            const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
            setData(parsedData.filter(Boolean))
        } catch (error) {
            console.error('Error fetching all transactions:', error)
            setData([])
        } finally {
            setIsLoading(false)
        }
    }, [selectedYear])

    useEffect(() => {
        fetchYears()
    }, [fetchYears])

    const filteredData = data?.filter(item => {
        if (filter === 'all') return true
        if (filter === 'stock') return !!item.t_symbol
        if (filter === 'cash') return !item.t_symbol
        return true
    })

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
                    
                    <div className="flex items-center gap-2 border rounded-md p-1 bg-muted/30">
                        <Button
                            variant={filter === 'all' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8"
                            onClick={() => setFilter('all')}
                        >
                            Show All
                        </Button>
                        <Button
                            variant={filter === 'cash' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8"
                            onClick={() => setFilter('cash')}
                        >
                            Cash Only
                        </Button>
                        <Button
                            variant={filter === 'stock' ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-8"
                            onClick={() => setFilter('stock')}
                        >
                            Stock Only
                        </Button>
                    </div>

                    <Button 
                        onClick={fetchData} 
                        disabled={isLoading}
                    >
                        {isLoading ? 'Loading...' : 'Get Transactions'}
                    </Button>

                    <div className="ml-auto flex items-center gap-4">
                        <Button
                            variant={showLotAnalyzer ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setShowLotAnalyzer(!showLotAnalyzer)}
                        >
                            {showLotAnalyzer ? 'Hide Lot Analyzer' : 'Lot Analyzer'}
                        </Button>
                        {isLoading && <Spinner className="h-4 w-4" />}
                    </div>
                </div>

                {showLotAnalyzer && filteredData && filteredData.length > 0 && (
                    <div className="mb-6">
                        <LotAnalyzer transactions={filteredData} />
                    </div>
                )}

                {!isLoading && data && filteredData && filteredData.length === 0 && (
                    <div className="text-center p-8 bg-muted rounded-lg">
                        <h2 className="text-xl font-semibold mb-4">No Transactions Found</h2>
                        <p className="mb-6">
                            {filter === 'stock' ? 'No stock transactions found' : 
                             filter === 'cash' ? 'No cash transactions found' :
                             selectedYear === 'all'
                                ? 'No transactions found across your accounts.'
                                : `No transactions found for ${selectedYear}.`}
                        </p>
                    </div>
                )}

                {filteredData && filteredData.length > 0 && !showLotAnalyzer && (
                    <TransactionsTable
                        data={filteredData}
                        enableTagging
                    />
                )}
            </div>
        </>
    )
}
