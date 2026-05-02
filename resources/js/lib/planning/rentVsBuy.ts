import currency from 'currency.js'

import { type FilingStatus, getLatestStandardDeductionYear, getStandardDeduction } from '@/lib/tax/standardDeductions'

const MONTHS_PER_YEAR = 12
const SALT_CAP = 10_000
const MORTGAGE_INTEREST_DEDUCTION_CAP = 750_000
const CAPITAL_GAINS_EXCLUSION_SINGLE = 250_000
const CAPITAL_GAINS_EXCLUSION_MARRIED = 500_000
const PROP_13_ASSESSMENT_GROWTH_CAP = 0.02
const PRECISE = { precision: 6 }

export type ExpensePeriod = 'monthly' | 'annual'
export type ClosingCostsType = 'percent' | 'amount'

export interface RentVsBuyInputs {
  homePrice: number
  downPaymentPercent: number
  mortgageRatePercent: number
  mortgageTermYears: number
  closingCostsValue: number
  closingCostsType: ClosingCostsType
  propertyTaxRatePercent: number
  useCaliforniaProp13: boolean
  hoaAmount: number
  hoaPeriod: ExpensePeriod
  hoaGrowthPercent: number
  homeownersInsuranceAnnual: number
  homeownersInsuranceGrowthPercent: number
  maintenancePercent: number
  appreciationPercent: number
  sellingCostsPercent: number
  monthlyRent: number
  rentersInsuranceAmount: number
  rentersInsurancePeriod: ExpensePeriod
  rentersInsuranceGrowthPercent: number
  rentIncreasePercent: number
  investmentReturnPercent: number
  marginalTaxRatePercent: number
  capitalGainsTaxRatePercent: number
  filingStatus: FilingStatus
  timeHorizonYears: number
  inflationRatePercent: number
}

export interface RentVsBuyYearRow {
  year: number
  ownCumulativeCost: number
  rentCumulativeCost: number
  homeEquity: number
  investedPortfolio: number
  capitalGainsTax: number
  netOwnPosition: number
  netRentPosition: number
}

export interface RentVsBuyResults {
  rows: RentVsBuyYearRow[]
  breakEvenYear: number | null
  finalWealthDelta: number
}

function clampPercent(percent: number): number {
  return percent < 0 ? 0 : percent
}

function toRate(percent: number): number {
  return clampPercent(percent) / 100
}

function toWholeYears(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.floor(value))
}

function roundMoney(value: number): number {
  return currency(value).value
}

function preciseMoney(value: number): ReturnType<typeof currency> {
  return currency(value, PRECISE)
}

function addMoney(left: number, right: number): number {
  return currency(left).add(right).value
}

function subtractMoney(left: number, right: number): number {
  return currency(left).subtract(right).value
}

function multiplyMoney(amount: number, multiplier: number): number {
  return preciseMoney(amount).multiply(multiplier).value
}

function divideMoney(amount: number, divisor: number): number {
  return divisor === 0 ? 0 : preciseMoney(amount).divide(divisor).value
}

function minMoney(left: number, right: number): number {
  return roundMoney(left <= right ? left : right)
}

function maxMoney(left: number, right: number): number {
  return roundMoney(left >= right ? left : right)
}

function sumMoney(values: number[]): number {
  return values.reduce((total, value) => currency(total).add(value).value, 0)
}

function discountMoney(amount: number, inflationRate: number, year: number): number {
  if (inflationRate <= 0 || year <= 0) {
    return roundMoney(amount)
  }

  const discountFactor = Math.pow(1 + inflationRate, year)
  return roundMoney(divideMoney(amount, discountFactor))
}

function getAnnualizedExpense(amount: number, period: ExpensePeriod): number {
  return period === 'monthly'
    ? roundMoney(multiplyMoney(amount, MONTHS_PER_YEAR))
    : roundMoney(amount)
}

function getClosingCosts(purchasePrice: number, inputs: RentVsBuyInputs): number {
  if (inputs.closingCostsType === 'amount') {
    return roundMoney(inputs.closingCostsValue)
  }

  return roundMoney(multiplyMoney(purchasePrice, toRate(inputs.closingCostsValue)))
}

function getCapitalGainsExclusion(filingStatus: FilingStatus): number {
  return filingStatus === 'Married Filing Jointly'
    ? CAPITAL_GAINS_EXCLUSION_MARRIED
    : CAPITAL_GAINS_EXCLUSION_SINGLE
}

function getCapitalGainsTax(
  homeValue: number,
  purchasePrice: number,
  closingCosts: number,
  sellingCosts: number,
  capitalGainsTaxRate: number,
  filingStatus: FilingStatus,
): number {
  if (capitalGainsTaxRate <= 0) {
    return 0
  }

  const saleProceedsBeforeDebt = subtractMoney(homeValue, sellingCosts)
  const gainBeforeExclusion = subtractMoney(saleProceedsBeforeDebt, addMoney(purchasePrice, closingCosts))
  const taxableGain = maxMoney(subtractMoney(gainBeforeExclusion, getCapitalGainsExclusion(filingStatus)), 0)

  return roundMoney(multiplyMoney(taxableGain, capitalGainsTaxRate))
}

function getMonthlyMortgagePayment(principal: number, annualRate: number, termYears: number): number {
  const totalMonths = toWholeYears(termYears) * MONTHS_PER_YEAR
  if (principal <= 0 || annualRate <= 0 || totalMonths <= 0) {
    return 0
  }

  const monthlyRate = annualRate / MONTHS_PER_YEAR
  const growth = Math.pow(1 + monthlyRate, totalMonths)
  if (growth <= 1) {
    return 0
  }

  const numerator = multiplyMoney(principal, monthlyRate * growth)
  return roundMoney(divideMoney(numerator, growth - 1))
}

function getDeductibleMortgageInterest(interestPaid: number, acquisitionDebt: number): number {
  if (interestPaid <= 0 || acquisitionDebt <= 0) {
    return 0
  }

  const deductiblePrincipal = minMoney(acquisitionDebt, MORTGAGE_INTEREST_DEDUCTION_CAP)
  const deductibleRatio = deductiblePrincipal / acquisitionDebt

  return roundMoney(multiplyMoney(interestPaid, deductibleRatio))
}

export function computeRentVsBuy(inputs: RentVsBuyInputs): RentVsBuyResults {
  const horizonYears = toWholeYears(inputs.timeHorizonYears)
  if (horizonYears <= 0) {
    return {
      rows: [],
      breakEvenYear: null,
      finalWealthDelta: 0,
    }
  }

  const purchasePrice = roundMoney(inputs.homePrice)
  const downPaymentRate = toRate(inputs.downPaymentPercent)
  const mortgageRate = toRate(inputs.mortgageRatePercent)
  const propertyTaxRate = toRate(inputs.propertyTaxRatePercent)
  const hoaGrowthRate = toRate(inputs.hoaGrowthPercent)
  const homeownersInsuranceGrowthRate = toRate(inputs.homeownersInsuranceGrowthPercent)
  const maintenanceRate = toRate(inputs.maintenancePercent)
  const appreciationRate = toRate(inputs.appreciationPercent)
  const sellingCostsRate = toRate(inputs.sellingCostsPercent)
  const rentersInsuranceGrowthRate = toRate(inputs.rentersInsuranceGrowthPercent)
  const rentIncreaseRate = toRate(inputs.rentIncreasePercent)
  const investmentReturnRate = toRate(inputs.investmentReturnPercent)
  const marginalTaxRate = toRate(inputs.marginalTaxRatePercent)
  const capitalGainsTaxRate = toRate(inputs.capitalGainsTaxRatePercent)
  const inflationRate = toRate(inputs.inflationRatePercent)
  const termYears = toWholeYears(inputs.mortgageTermYears)
  const latestTaxYear = getLatestStandardDeductionYear()

  const usesMortgage = mortgageRate > 0 && termYears > 0
  const downPayment = usesMortgage ? roundMoney(multiplyMoney(purchasePrice, downPaymentRate)) : purchasePrice
  const loanPrincipal = usesMortgage ? roundMoney(subtractMoney(purchasePrice, downPayment)) : 0
  const closingCosts = getClosingCosts(purchasePrice, inputs)
  const monthlyMortgagePayment = usesMortgage ? getMonthlyMortgagePayment(loanPrincipal, mortgageRate, termYears) : 0

  const avoidedUpfrontInvestment = usesMortgage
    ? roundMoney(addMoney(downPayment, closingCosts))
    : roundMoney(addMoney(purchasePrice, closingCosts))

  let annualHomeownersInsurance = roundMoney(inputs.homeownersInsuranceAnnual)
  let annualRentersInsurance = getAnnualizedExpense(inputs.rentersInsuranceAmount, inputs.rentersInsurancePeriod)
  let annualHoa = getAnnualizedExpense(inputs.hoaAmount, inputs.hoaPeriod)

  let remainingBalance = loanPrincipal
  let homeValue = purchasePrice
  let prop13AssessedValue = purchasePrice
  let monthlyRent = roundMoney(inputs.monthlyRent)
  let investedPortfolio = avoidedUpfrontInvestment
  let foregoneUpfrontInvestment = avoidedUpfrontInvestment
  let ownCumulativeCost = closingCosts
  let rentCumulativeCost = 0

  const rows: RentVsBuyYearRow[] = []

  for (let year = 1; year <= horizonYears; year += 1) {
    const propertyTaxBase = inputs.useCaliforniaProp13 ? prop13AssessedValue : homeValue
    const annualPropertyTax = roundMoney(multiplyMoney(propertyTaxBase, propertyTaxRate))
    const annualMaintenance = roundMoney(multiplyMoney(homeValue, maintenanceRate))
    const monthlyPropertyTax = divideMoney(annualPropertyTax, MONTHS_PER_YEAR)
    const monthlyMaintenance = divideMoney(annualMaintenance, MONTHS_PER_YEAR)
    const monthlyHomeownersInsurance = divideMoney(annualHomeownersInsurance, MONTHS_PER_YEAR)
    const monthlyRentersInsurance = divideMoney(annualRentersInsurance, MONTHS_PER_YEAR)
    const monthlyHoa = divideMoney(annualHoa, MONTHS_PER_YEAR)

    let annualMortgageInterest = 0
    let annualDeductibleMortgageInterest = 0
    let annualOwnCashOutflow = 0
    let annualRentCashOutflow = 0

    for (let month = 0; month < MONTHS_PER_YEAR; month += 1) {
      let interestPayment = 0
      let principalPayment = 0
      let mortgagePayment = 0

      if (remainingBalance > 0 && monthlyMortgagePayment > 0) {
        interestPayment = roundMoney(multiplyMoney(remainingBalance, mortgageRate / MONTHS_PER_YEAR))
        annualDeductibleMortgageInterest = roundMoney(addMoney(
          annualDeductibleMortgageInterest,
          getDeductibleMortgageInterest(interestPayment, remainingBalance),
        ))
        principalPayment = roundMoney(subtractMoney(monthlyMortgagePayment, interestPayment))

        if (principalPayment > remainingBalance) {
          principalPayment = remainingBalance
          mortgagePayment = roundMoney(addMoney(interestPayment, principalPayment))
        } else {
          mortgagePayment = monthlyMortgagePayment
        }

        remainingBalance = roundMoney(subtractMoney(remainingBalance, principalPayment))
        annualMortgageInterest = roundMoney(addMoney(annualMortgageInterest, interestPayment))
      }

      const ownMonthlyOutflow = sumMoney([
        mortgagePayment,
        monthlyPropertyTax,
        monthlyHoa,
        monthlyHomeownersInsurance,
        monthlyMaintenance,
      ])
      const rentMonthlyOutflow = roundMoney(addMoney(monthlyRent, monthlyRentersInsurance))

      annualOwnCashOutflow = roundMoney(addMoney(annualOwnCashOutflow, ownMonthlyOutflow))
      annualRentCashOutflow = roundMoney(addMoney(annualRentCashOutflow, rentMonthlyOutflow))
    }

    const deductiblePropertyTax = minMoney(annualPropertyTax, SALT_CAP)
    const itemizedDeduction = roundMoney(addMoney(annualDeductibleMortgageInterest, deductiblePropertyTax))
    const standardDeduction = getStandardDeduction(latestTaxYear, inputs.filingStatus)
    const taxBenefit = standardDeduction > 0 && itemizedDeduction > standardDeduction
      ? roundMoney(multiplyMoney(subtractMoney(itemizedDeduction, standardDeduction), marginalTaxRate))
      : 0

    const annualOwnEconomicCostBeforeTax = sumMoney([
      annualMortgageInterest,
      annualPropertyTax,
      annualMaintenance,
      annualHoa,
      annualHomeownersInsurance,
    ])
    const annualOwnEconomicCost = roundMoney(subtractMoney(annualOwnEconomicCostBeforeTax, taxBenefit))
    const annualUpfrontOpportunityCost = roundMoney(multiplyMoney(foregoneUpfrontInvestment, investmentReturnRate))

    const discountedOwnCost = discountMoney(
      addMoney(annualOwnEconomicCost, annualUpfrontOpportunityCost),
      inflationRate,
      year,
    )
    const discountedRentCost = discountMoney(annualRentCashOutflow, inflationRate, year)

    ownCumulativeCost = roundMoney(addMoney(ownCumulativeCost, discountedOwnCost))
    rentCumulativeCost = roundMoney(addMoney(rentCumulativeCost, discountedRentCost))

    foregoneUpfrontInvestment = roundMoney(addMoney(foregoneUpfrontInvestment, annualUpfrontOpportunityCost))

    const annualSavingsContribution = maxMoney(subtractMoney(annualOwnCashOutflow, annualRentCashOutflow), 0)
    investedPortfolio = roundMoney(addMoney(
      multiplyMoney(investedPortfolio, 1 + investmentReturnRate),
      annualSavingsContribution,
    ))

    homeValue = roundMoney(multiplyMoney(homeValue, 1 + appreciationRate))
    if (inputs.useCaliforniaProp13) {
      prop13AssessedValue = minMoney(
        homeValue,
        multiplyMoney(prop13AssessedValue, 1 + PROP_13_ASSESSMENT_GROWTH_CAP),
      )
    }

    const sellingCosts = roundMoney(multiplyMoney(homeValue, sellingCostsRate))
    const capitalGainsTax = getCapitalGainsTax(
      homeValue,
      purchasePrice,
      closingCosts,
      sellingCosts,
      capitalGainsTaxRate,
      inputs.filingStatus,
    )
    const sellableEquity = maxMoney(
      subtractMoney(subtractMoney(subtractMoney(homeValue, sellingCosts), capitalGainsTax), remainingBalance),
      0,
    )

    const discountedEquity = discountMoney(sellableEquity, inflationRate, year)
    const discountedPortfolio = discountMoney(investedPortfolio, inflationRate, year)

    rows.push({
      year,
      ownCumulativeCost,
      rentCumulativeCost,
      homeEquity: discountedEquity,
      investedPortfolio: discountedPortfolio,
      capitalGainsTax: discountMoney(capitalGainsTax, inflationRate, year),
      netOwnPosition: roundMoney(subtractMoney(discountedEquity, ownCumulativeCost)),
      netRentPosition: roundMoney(subtractMoney(discountedPortfolio, rentCumulativeCost)),
    })

    monthlyRent = roundMoney(multiplyMoney(monthlyRent, 1 + rentIncreaseRate))
    annualHoa = roundMoney(multiplyMoney(annualHoa, 1 + hoaGrowthRate))
    annualHomeownersInsurance = roundMoney(multiplyMoney(annualHomeownersInsurance, 1 + homeownersInsuranceGrowthRate))
    annualRentersInsurance = roundMoney(multiplyMoney(annualRentersInsurance, 1 + rentersInsuranceGrowthRate))
  }

  const breakEvenYear = rows.find((row) => row.ownCumulativeCost <= row.rentCumulativeCost)?.year ?? null
  const finalRow = rows.at(-1)

  return {
    rows,
    breakEvenYear,
    finalWealthDelta: finalRow ? roundMoney(subtractMoney(finalRow.homeEquity, finalRow.investedPortfolio)) : 0,
  }
}
