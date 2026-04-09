'use client'

import { Download, Plus, Settings, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { AccountLineItem } from '@/data/finance/AccountLineItem'
import { importUrl, maintenanceUrl } from '@/lib/financeRouteBuilder'

import type { FinanceTag } from './useFinanceTags'
import { YearSelectorWithNav } from './YearSelectorWithNav'

export type FilterType = 'all' | 'cash' | 'stock'

interface TransactionsPageToolbarProps {
  accountId: number | 'all'
  isAllAccounts: boolean
  selectedYear: string
  availableYears: number[]
  onYearChange: (year: string) => void
  filter: FilterType
  onFilterChange: (filter: FilterType) => void
  selectedTag: string
  availableTags: FinanceTag[]
  onTagChange: (tag: string) => void
  data: AccountLineItem[] | null
  isLoading: boolean
  onExportCSV: () => void
  onExportJSON: () => void
  onNewTransaction: () => void
}

export function TransactionsPageToolbar({
  accountId, isAllAccounts, selectedYear, availableYears, onYearChange,
  filter, onFilterChange, selectedTag, availableTags, onTagChange,
  data, isLoading, onExportCSV, onExportJSON, onNewTransaction,
}: TransactionsPageToolbarProps) {
  const disabledTooltip = 'Select an account to import or modify that account.'

  return (
    <div className="flex items-center gap-4 mb-4 flex-wrap px-8">
      <YearSelectorWithNav
        selectedYear={selectedYear === 'all' ? 'all' : parseInt(selectedYear, 10)}
        availableYears={availableYears}
        onYearChange={(year) => onYearChange(String(year))}
      />

      <Select value={selectedTag} onValueChange={onTagChange}>
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Select tag" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Tags</SelectItem>
          {availableTags.map((tag) => (
            <SelectItem key={tag.tag_id} value={tag.tag_label}>
              {tag.tag_label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={filter} onValueChange={(v) => onFilterChange(v as FilterType)}>
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Show" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Cash + Stock</SelectItem>
          <SelectItem value="cash">Cash Only</SelectItem>
          <SelectItem value="stock">Stock Only</SelectItem>
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        {isLoading && (
          <div className="flex items-center gap-2 mr-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled={isAllAccounts} asChild={!isAllAccounts}>
                {isAllAccounts ? (
                  <span className="flex items-center gap-1">
                    <Upload className="h-4 w-4" /> Import
                  </span>
                ) : (
                  <a href={importUrl(accountId as number)} className="flex items-center gap-1">
                    <Upload className="h-4 w-4" /> Import
                  </a>
                )}
              </Button>
            </span>
          </TooltipTrigger>
          {isAllAccounts && <TooltipContent>{disabledTooltip}</TooltipContent>}
        </Tooltip>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!data || data.length === 0}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={onExportCSV}>Export as CSV</DropdownMenuItem>
            <DropdownMenuItem onClick={onExportJSON}>Export as JSON</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled={isAllAccounts} asChild={!isAllAccounts}>
                {isAllAccounts ? (
                  <span className="flex items-center gap-1">
                    <Settings className="h-4 w-4" /> Maintenance
                  </span>
                ) : (
                  <a href={maintenanceUrl(accountId as number)} className="flex items-center gap-1">
                    <Settings className="h-4 w-4" /> Maintenance
                  </a>
                )}
              </Button>
            </span>
          </TooltipTrigger>
          {isAllAccounts && <TooltipContent>{disabledTooltip}</TooltipContent>}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="outline" size="sm" disabled={isAllAccounts} onClick={isAllAccounts ? undefined : onNewTransaction}>
                <Plus className="h-4 w-4 mr-1" /> New Transaction
              </Button>
            </span>
          </TooltipTrigger>
          {isAllAccounts && <TooltipContent>{disabledTooltip}</TooltipContent>}
        </Tooltip>
      </div>
    </div>
  )
}
