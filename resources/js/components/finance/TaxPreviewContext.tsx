'use client'

import currency from 'currency.js'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { computeScheduleCNetIncome } from '@/components/finance/ScheduleCPreview'
import type { fin_payslip } from '@/components/payslip/payslipDbCols'
import { fetchWrapper } from '@/fetchWrapper'
import type { EmploymentEntity, F1099DivParsedData, F1099IntParsedData, TaxDocument } from '@/types/finance/tax-document'

import type { ScheduleCResponse, YearData } from './ScheduleCPreview'

export interface TaxPreviewShellData {
  year: number
  availableYears: number[]
}

export interface TaxPreviewAccount {
  acct_id: number
  acct_name: string
  acct_is_debt?: boolean | null
  acct_is_retirement?: boolean | null
  when_closed?: string | null
}

export interface TaxPreviewDataset {
  year: number
  availableYears: number[]
  payslips: fin_payslip[]
  pendingReviewCount: number
  w2Documents: TaxDocument[]
  accountDocuments: TaxDocument[]
  scheduleCData: ScheduleCResponse
  employmentEntities: EmploymentEntity[]
  accounts: TaxPreviewAccount[]
  activeAccountIds: number[]
}

interface TaxPreviewContextValue {
  year: number
  availableYears: number[]
  isLoading: boolean
  error: string | null
  payslips: fin_payslip[]
  pendingReviewCount: number
  w2Documents: TaxDocument[]
  accountDocuments: TaxDocument[]
  reviewedW2Docs: TaxDocument[]
  reviewed1099Docs: TaxDocument[]
  reviewedK1Docs: TaxDocument[]
  scheduleCData: ScheduleCResponse | null
  scheduleCNetIncome: { total: number; byQuarter: { q1: number; q2: number; q3: number; q4: number } }
  employmentEntities: EmploymentEntity[]
  accounts: TaxPreviewAccount[]
  activeAccountIds: number[]
  income1099: {
    interestIncome: currency
    dividendIncome: currency
    qualifiedDividends: currency
  }
  setPayslips: Dispatch<SetStateAction<fin_payslip[]>>
  setPendingReviewCount: Dispatch<SetStateAction<number>>
  setW2Documents: Dispatch<SetStateAction<TaxDocument[]>>
  setAccountDocuments: Dispatch<SetStateAction<TaxDocument[]>>
  setScheduleCData: Dispatch<SetStateAction<ScheduleCResponse | null>>
  setEmploymentEntities: Dispatch<SetStateAction<EmploymentEntity[]>>
  setAccounts: Dispatch<SetStateAction<TaxPreviewAccount[]>>
  setActiveAccountIds: Dispatch<SetStateAction<number[]>>
  refreshAll: () => Promise<void>
}

const TaxPreviewContext = createContext<TaxPreviewContextValue | null>(null)

function buildEmptyScheduleCNetIncome() {
  return { total: 0, byQuarter: { q1: 0, q2: 0, q3: 0, q4: 0 } }
}

export function TaxPreviewProvider({
  initialData,
  children,
}: {
  initialData?: TaxPreviewShellData | null
  children: ReactNode
}) {
  const year = initialData?.year ?? new Date().getFullYear()
  const [availableYears, setAvailableYears] = useState<number[]>(initialData?.availableYears ?? [])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payslips, setPayslips] = useState<fin_payslip[]>([])
  const [pendingReviewCount, setPendingReviewCount] = useState(0)
  const [w2Documents, setW2Documents] = useState<TaxDocument[]>([])
  const [accountDocuments, setAccountDocuments] = useState<TaxDocument[]>([])
  const [scheduleCData, setScheduleCData] = useState<ScheduleCResponse | null>(null)
  const [employmentEntities, setEmploymentEntities] = useState<EmploymentEntity[]>([])
  const [accounts, setAccounts] = useState<TaxPreviewAccount[]>([])
  const [activeAccountIds, setActiveAccountIds] = useState<number[]>([])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = (await fetchWrapper.get(`/api/finance/tax-preview-data?year=${year}`)) as TaxPreviewDataset
      setAvailableYears(response.availableYears ?? [])
      setPayslips(Array.isArray(response.payslips) ? response.payslips : [])
      setPendingReviewCount(response.pendingReviewCount ?? 0)
      setW2Documents(Array.isArray(response.w2Documents) ? response.w2Documents : [])
      setAccountDocuments(Array.isArray(response.accountDocuments) ? response.accountDocuments : [])
      setScheduleCData(response.scheduleCData ?? null)
      setEmploymentEntities(Array.isArray(response.employmentEntities) ? response.employmentEntities : [])
      setAccounts(Array.isArray(response.accounts) ? response.accounts : [])
      setActiveAccountIds(Array.isArray(response.activeAccountIds) ? response.activeAccountIds : [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax preview data')
    } finally {
      setIsLoading(false)
    }
  }, [year])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const reviewedW2Docs = useMemo(
    () => w2Documents.filter((doc) => doc.is_reviewed),
    [w2Documents],
  )

  const reviewed1099Docs = useMemo(
    () => accountDocuments.filter((doc) => doc.is_reviewed && doc.form_type !== 'k1'),
    [accountDocuments],
  )

  const reviewedK1Docs = useMemo(
    () => accountDocuments.filter((doc) => doc.is_reviewed && doc.form_type === 'k1'),
    [accountDocuments],
  )

  const income1099 = useMemo(() => {
    let interestIncome = currency(0)
    let dividendIncome = currency(0)
    let qualifiedDividends = currency(0)

    for (const doc of reviewed1099Docs) {
      if (!doc.parsed_data) continue
      if (doc.form_type === '1099_int' || doc.form_type === '1099_int_c') {
        interestIncome = interestIncome.add((doc.parsed_data as F1099IntParsedData).box1_interest ?? 0)
      }
      if (doc.form_type === '1099_div' || doc.form_type === '1099_div_c') {
        dividendIncome = dividendIncome.add((doc.parsed_data as F1099DivParsedData).box1a_ordinary ?? 0)
        qualifiedDividends = qualifiedDividends.add((doc.parsed_data as F1099DivParsedData).box1b_qualified ?? 0)
      }
    }

    return { interestIncome, dividendIncome, qualifiedDividends }
  }, [reviewed1099Docs])

  const scheduleCNetIncome = useMemo(() => {
    if (!scheduleCData?.years) return buildEmptyScheduleCNetIncome()

    return computeScheduleCNetIncome(scheduleCData.years as YearData[], year)
  }, [scheduleCData, year])

  const value = useMemo<TaxPreviewContextValue>(() => ({
    year,
    availableYears,
    isLoading,
    error,
    payslips,
    pendingReviewCount,
    w2Documents,
    accountDocuments,
    reviewedW2Docs,
    reviewed1099Docs,
    reviewedK1Docs,
    scheduleCData,
    scheduleCNetIncome,
    employmentEntities,
    accounts,
    activeAccountIds,
    income1099,
    setPayslips,
    setPendingReviewCount,
    setW2Documents,
    setAccountDocuments,
    setScheduleCData,
    setEmploymentEntities,
    setAccounts,
    setActiveAccountIds,
    refreshAll,
  }), [
    year,
    availableYears,
    isLoading,
    error,
    payslips,
    pendingReviewCount,
    w2Documents,
    accountDocuments,
    reviewedW2Docs,
    reviewed1099Docs,
    reviewedK1Docs,
    scheduleCData,
    scheduleCNetIncome,
    employmentEntities,
    accounts,
    activeAccountIds,
    income1099,
    refreshAll,
  ])

  return <TaxPreviewContext.Provider value={value}>{children}</TaxPreviewContext.Provider>
}

export function useTaxPreview(): TaxPreviewContextValue {
  const context = useContext(TaxPreviewContext)

  if (!context) {
    throw new Error('useTaxPreview must be used within a TaxPreviewProvider')
  }

  return context
}
