'use client'
import { useCallback, useState } from 'react'
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

interface AllTransactionsPageProps {
    initialAvailableYears?: number[]
}

export default function AllTransactionsPage({ initialAvailableYears = [] }: AllTransactionsPageProps) {
    const [data, setData] = useState<AccountLineItem[] | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [accountMap, setAccountMap] = useState<Map<number, string>>(new Map())
    const [selectedYear, setSelectedYear] = useState<string>(() => {
        const currentYear = new Date().getFullYear()
        if (initialAvailableYears.includes(currentYear)) {
            return currentYear.toString()
        }
        return initialAvailableYears.length > 0 ? initialAvailableYears[0].toString() : 'all'
    })
    const [availableYears, setAvailableYears] = useState<number[]>(initialAvailableYears)
    const [showLotAnalyzer, setShowLotAnalyzer] = useState(false)
    const [filter, setFilter] = useState<FilterType>('all')

    const fetchAccounts = useCallback(async () => {
        try {
            const response = await fetchWrapper.get('/api/finance/accounts')
            if (response && typeof response === 'object') {
                const map = new Map<number, string>()
                // Combine all account categories into one flat map
                const categories = ['assetAccounts', 'liabilityAccounts', 'retirementAccounts']
                categories.forEach(cat => {
                    const accounts = response[cat]
                    if (Array.isArray(accounts)) {
                        accounts.forEach((acc: any) => {
                            if (acc.acct_id && acc.acct_name) {
                                map.set(Number(acc.acct_id), acc.acct_name)
                            }
                        })
                    }
                })
                setAccountMap(map)
            }
        } catch (error) {
            console.error('Error fetching accounts:', error)
        }
    }, [])

    const fetchData = useCallback(async () => {
        try {
            setIsLoading(true)
            
            // Ensure accounts are loaded first for mapping
            if (accountMap.size === 0) {
                await fetchAccounts()
            }

            const params = new URLSearchParams()
            if (selectedYear !== 'all') params.append('year', selectedYear)
            if (filter !== 'all') params.append('filter', filter)
            
            const queryString = params.toString() ? `?${params.toString()}` : ''
            const fetchedData = await fetchWrapper.get(`/api/finance/all-line-items${queryString}`)
            const parsedData = z.array(AccountLineItemSchema).parse(fetchedData)
            setData(parsedData.filter(Boolean))
        } catch (error) {
            console.error('Error fetching all transactions:', error)
            setData([])
        } finally {
            setIsLoading(false)
        }
    }, [selectedYear, filter, accountMap.size, fetchAccounts])

    // No client-side filtering needed anymore
    const filteredData = data

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
                        <LotAnalyzer
                            transactions={filteredData}
                            accountMap={accountMap}
                            onLoadAllYears={() => {
                                setSelectedYear('all')
                                // fetchData will be called via useEffect or user clicks Get Transactions
                            }}
                        />
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
