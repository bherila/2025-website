'use client'

import currency from 'currency.js'
import { type ReactElement,useEffect, useMemo, useState } from 'react'

import Container from '@/components/container'
import { computeRentVsBuy, type RentVsBuyInputs } from '@/lib/planning/rentVsBuy'
import type { FilingStatus } from '@/lib/tax/standardDeductions'

import RentVsBuyExplainer from './RentVsBuyExplainer'
import RentVsBuyForm from './RentVsBuyForm'
import RentVsBuyResults from './RentVsBuyResults'

const DEFAULT_INPUTS: RentVsBuyInputs = {
  homePrice: 800_000,
  downPaymentPercent: 20,
  mortgageRatePercent: 7.25,
  mortgageTermYears: 30,
  closingCostsValue: 3,
  closingCostsType: 'percent',
  propertyTaxRatePercent: 1.1,
  useCaliforniaProp13: false,
  hoaAmount: 350,
  hoaPeriod: 'monthly',
  homeownersInsuranceAnnual: 2_000,
  maintenancePercent: 1,
  appreciationPercent: 3,
  sellingCostsPercent: 6,
  monthlyRent: 3_500,
  rentersInsuranceAmount: 240,
  rentersInsurancePeriod: 'annual',
  rentIncreasePercent: 3,
  investmentReturnPercent: 6,
  marginalTaxRatePercent: 30,
  capitalGainsTaxRatePercent: 15,
  filingStatus: 'Single',
  timeHorizonYears: 10,
  inflationRatePercent: 2.5,
}

const filingStatuses = new Set<FilingStatus>([
  'Single',
  'Married Filing Jointly',
  'Married Filing Separately',
  'Head of Household',
])

const QUERY_KEYS: Record<keyof RentVsBuyInputs, string> = {
  homePrice: 'price',
  downPaymentPercent: 'down',
  mortgageRatePercent: 'rate',
  mortgageTermYears: 'term',
  closingCostsValue: 'closing',
  closingCostsType: 'closing_type',
  propertyTaxRatePercent: 'tax',
  useCaliforniaProp13: 'prop13',
  hoaAmount: 'hoa',
  hoaPeriod: 'hoa_period',
  homeownersInsuranceAnnual: 'home_ins',
  maintenancePercent: 'maint',
  appreciationPercent: 'app',
  sellingCostsPercent: 'sell',
  monthlyRent: 'rent',
  rentersInsuranceAmount: 'rent_ins',
  rentersInsurancePeriod: 'rent_ins_period',
  rentIncreasePercent: 'rent_grow',
  investmentReturnPercent: 'invest',
  marginalTaxRatePercent: 'marginal_tax',
  capitalGainsTaxRatePercent: 'capital_gains_tax',
  filingStatus: 'filing',
  timeHorizonYears: 'horizon',
  inflationRatePercent: 'inflation',
}

type NumericRentVsBuyInputKey = {
  [Key in keyof RentVsBuyInputs]: RentVsBuyInputs[Key] extends number ? Key : never
}[keyof RentVsBuyInputs]

const moneyInputKeys = new Set<NumericRentVsBuyInputKey>([
  'homePrice',
  'hoaAmount',
  'homeownersInsuranceAnnual',
  'monthlyRent',
  'rentersInsuranceAmount',
])

function parseBoolean(searchParams: URLSearchParams, key: keyof RentVsBuyInputs): boolean {
  const alias = QUERY_KEYS[key]
  const raw = searchParams.get(alias)
  if (raw === null) {
    return Boolean(DEFAULT_INPUTS[key])
  }

  return raw === 'true' || raw === '1'
}

function parseNumber(searchParams: URLSearchParams, key: NumericRentVsBuyInputKey): number {
  const alias = QUERY_KEYS[key]
  const raw = searchParams.get(alias)
  if (raw === null) {
    return DEFAULT_INPUTS[key]
  }

  const parsed = moneyInputKeys.has(key) ? currency(raw).value : Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULT_INPUTS[key]
}

function parseExpensePeriod(searchParams: URLSearchParams, key: keyof RentVsBuyInputs): 'monthly' | 'annual' {
  const raw = searchParams.get(QUERY_KEYS[key])
  return raw === 'monthly' || raw === 'annual'
    ? raw
    : DEFAULT_INPUTS[key] as 'monthly' | 'annual'
}

function parseClosingCostsType(searchParams: URLSearchParams): 'percent' | 'amount' {
  const raw = searchParams.get(QUERY_KEYS.closingCostsType)
  return raw === 'percent' || raw === 'amount'
    ? raw
    : DEFAULT_INPUTS.closingCostsType
}

function parseInputs(search: string): RentVsBuyInputs {
  const searchParams = new URLSearchParams(search)
  const filingStatus = searchParams.get(QUERY_KEYS.filingStatus)

  return {
    homePrice: parseNumber(searchParams, 'homePrice'),
    downPaymentPercent: parseNumber(searchParams, 'downPaymentPercent'),
    mortgageRatePercent: parseNumber(searchParams, 'mortgageRatePercent'),
    mortgageTermYears: parseNumber(searchParams, 'mortgageTermYears'),
    closingCostsValue: parseNumber(searchParams, 'closingCostsValue'),
    closingCostsType: parseClosingCostsType(searchParams),
    propertyTaxRatePercent: parseNumber(searchParams, 'propertyTaxRatePercent'),
    useCaliforniaProp13: parseBoolean(searchParams, 'useCaliforniaProp13'),
    hoaAmount: parseNumber(searchParams, 'hoaAmount'),
    hoaPeriod: parseExpensePeriod(searchParams, 'hoaPeriod'),
    homeownersInsuranceAnnual: parseNumber(searchParams, 'homeownersInsuranceAnnual'),
    maintenancePercent: parseNumber(searchParams, 'maintenancePercent'),
    appreciationPercent: parseNumber(searchParams, 'appreciationPercent'),
    sellingCostsPercent: parseNumber(searchParams, 'sellingCostsPercent'),
    monthlyRent: parseNumber(searchParams, 'monthlyRent'),
    rentersInsuranceAmount: parseNumber(searchParams, 'rentersInsuranceAmount'),
    rentersInsurancePeriod: parseExpensePeriod(searchParams, 'rentersInsurancePeriod'),
    rentIncreasePercent: parseNumber(searchParams, 'rentIncreasePercent'),
    investmentReturnPercent: parseNumber(searchParams, 'investmentReturnPercent'),
    marginalTaxRatePercent: parseNumber(searchParams, 'marginalTaxRatePercent'),
    capitalGainsTaxRatePercent: parseNumber(searchParams, 'capitalGainsTaxRatePercent'),
    filingStatus: filingStatus && filingStatuses.has(filingStatus as FilingStatus)
      ? filingStatus as FilingStatus
      : DEFAULT_INPUTS.filingStatus,
    timeHorizonYears: parseNumber(searchParams, 'timeHorizonYears'),
    inflationRatePercent: parseNumber(searchParams, 'inflationRatePercent'),
  }
}

function serializeInputs(inputs: RentVsBuyInputs): string {
  const searchParams = new URLSearchParams()

  for (const key of Object.keys(QUERY_KEYS) as (keyof RentVsBuyInputs)[]) {
    searchParams.set(QUERY_KEYS[key], String(inputs[key]))
  }

  return searchParams.toString()
}

function getCurrentQueryString(): string {
  return window.location.search.startsWith('?')
    ? window.location.search.slice(1)
    : window.location.search
}

export default function RentVsBuyPage(): ReactElement {
  const [inputs, setInputs] = useState<RentVsBuyInputs>(() => parseInputs(window.location.search))
  const results = useMemo(() => computeRentVsBuy(inputs), [inputs])

  useEffect(() => {
    const queryString = serializeInputs(inputs)
    const currentQueryString = getCurrentQueryString()
    if (currentQueryString === '' && queryString === serializeInputs(DEFAULT_INPUTS)) {
      return
    }
    if (queryString === currentQueryString) {
      return
    }

    window.history.replaceState(null, '', `${window.location.pathname}?${queryString}`)
  }, [inputs])

  return (
    <Container className="grid gap-8 py-8 md:py-10">
      <section className="grid gap-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Financial planning</p>
        <div className="grid gap-3">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Rent vs. Buy a Home</h1>
          <p className="max-w-3xl text-base leading-7 text-muted-foreground">
            Compare cumulative housing cost, opportunity cost, and end-of-horizon wealth using shareable URL state.
          </p>
        </div>
      </section>

      <RentVsBuyForm inputs={inputs} onChange={setInputs} />
      <RentVsBuyResults results={results} />
      <RentVsBuyExplainer />
    </Container>
  )
}
