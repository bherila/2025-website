import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import Container from '@/components/container'
import { RentVsBuyExplainer, RentVsBuyForm, RentVsBuyResults } from '@/components/planning/RentVsBuy'
import { computeRentVsBuy, type RentVsBuyInputs } from '@/lib/planning/rentVsBuy'
import type { FilingStatus } from '@/lib/tax/standardDeductions'

const DEFAULT_INPUTS: RentVsBuyInputs = {
  homePrice: 800_000,
  downPaymentPercent: 20,
  mortgageRatePercent: 7.25,
  mortgageTermYears: 30,
  closingCostsPercent: 3,
  propertyTaxRatePercent: 1.1,
  hoaMonthly: 350,
  homeownersInsuranceAnnual: 2_000,
  maintenancePercent: 1,
  appreciationPercent: 3,
  sellingCostsPercent: 6,
  monthlyRent: 3_500,
  rentersInsuranceAnnual: 240,
  rentIncreasePercent: 3,
  investmentReturnPercent: 6,
  marginalTaxRatePercent: 30,
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
  closingCostsPercent: 'closing',
  propertyTaxRatePercent: 'tax',
  hoaMonthly: 'hoa',
  homeownersInsuranceAnnual: 'home_ins',
  maintenancePercent: 'maint',
  appreciationPercent: 'app',
  sellingCostsPercent: 'sell',
  monthlyRent: 'rent',
  rentersInsuranceAnnual: 'rent_ins',
  rentIncreasePercent: 'rent_grow',
  investmentReturnPercent: 'invest',
  marginalTaxRatePercent: 'marginal_tax',
  filingStatus: 'filing',
  timeHorizonYears: 'horizon',
  inflationRatePercent: 'inflation',
}

function parseNumber(searchParams: URLSearchParams, key: keyof RentVsBuyInputs): number {
  const alias = QUERY_KEYS[key]
  const raw = searchParams.get(alias)
  if (raw === null) {
    return DEFAULT_INPUTS[key] as number
  }

  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : DEFAULT_INPUTS[key] as number
}

function parseInputs(search: string): RentVsBuyInputs {
  const searchParams = new URLSearchParams(search)
  const filingStatus = searchParams.get(QUERY_KEYS.filingStatus)

  return {
    homePrice: parseNumber(searchParams, 'homePrice'),
    downPaymentPercent: parseNumber(searchParams, 'downPaymentPercent'),
    mortgageRatePercent: parseNumber(searchParams, 'mortgageRatePercent'),
    mortgageTermYears: parseNumber(searchParams, 'mortgageTermYears'),
    closingCostsPercent: parseNumber(searchParams, 'closingCostsPercent'),
    propertyTaxRatePercent: parseNumber(searchParams, 'propertyTaxRatePercent'),
    hoaMonthly: parseNumber(searchParams, 'hoaMonthly'),
    homeownersInsuranceAnnual: parseNumber(searchParams, 'homeownersInsuranceAnnual'),
    maintenancePercent: parseNumber(searchParams, 'maintenancePercent'),
    appreciationPercent: parseNumber(searchParams, 'appreciationPercent'),
    sellingCostsPercent: parseNumber(searchParams, 'sellingCostsPercent'),
    monthlyRent: parseNumber(searchParams, 'monthlyRent'),
    rentersInsuranceAnnual: parseNumber(searchParams, 'rentersInsuranceAnnual'),
    rentIncreasePercent: parseNumber(searchParams, 'rentIncreasePercent'),
    investmentReturnPercent: parseNumber(searchParams, 'investmentReturnPercent'),
    marginalTaxRatePercent: parseNumber(searchParams, 'marginalTaxRatePercent'),
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

function RentVsBuyPage(): React.ReactElement {
  const [inputs, setInputs] = useState<RentVsBuyInputs>(() => parseInputs(window.location.search))
  const results = useMemo(() => computeRentVsBuy(inputs), [inputs])

  useEffect(() => {
    const queryString = serializeInputs(inputs)
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

const app = document.getElementById('app')

if (app) {
  createRoot(app).render(
    <React.StrictMode>
      <RentVsBuyPage />
    </React.StrictMode>,
  )
}
