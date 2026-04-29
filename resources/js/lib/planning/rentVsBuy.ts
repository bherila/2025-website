import currency from 'currency.js'

import { type FilingStatus, getLatestStandardDeductionYear, getStandardDeduction } from '@/lib/tax/standardDeductions'

const MONTHS_PER_YEAR = 12
const SALT_CAP = 10_000
const MORTGAGE_INTEREST_DEDUCTION_CAP = 750_000
const PRECISE = { precision: 6 }

export interface RentVsBuyInputs {
  homePrice: number
  downPaymentPercent: number
  mortgageRatePercent: number
  mortgageTermYears: number
  closingCostsPercent: number
  propertyTaxRatePercent: number
  hoaMonthly: number
  homeownersInsuranceAnnual: number
  maintenancePercent: number
  appreciationPercent: number
  sellingCostsPercent: number
  monthlyRent: number
  rentersInsuranceAnnual: number
  rentIncreasePercent: number
  investmentReturnPercent: number
  marginalTaxRatePercent: number
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

/**
 * Assumes the TCJA-era $750k principal cap applies to new acquisition debt.
 */
function getDeductibleMortgageInterest(interestPaid: number, originalPrincipal: number): number {
  if (interestPaid <= 0 || originalPrincipal <= 0) {
    return 0
  }

  const deductiblePrincipal = Math.min(originalPrincipal, MORTGAGE_INTEREST_DEDUCTION_CAP)
  const deductibleRatio = deductiblePrincipal / originalPrincipal

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
  const maintenanceRate = toRate(inputs.maintenancePercent)
  const appreciationRate = toRate(inputs.appreciationPercent)
  const sellingCostsRate = toRate(inputs.sellingCostsPercent)
  const rentIncreaseRate = toRate(inputs.rentIncreasePercent)
  const investmentReturnRate = toRate(inputs.investmentReturnPercent)
  const marginalTaxRate = toRate(inputs.marginalTaxRatePercent)
  const inflationRate = toRate(inputs.inflationRatePercent)
  const termYears = toWholeYears(inputs.mortgageTermYears)
  const latestTaxYear = getLatestStandardDeductionYear()

  const usesMortgage = mortgageRate > 0 && termYears > 0
  const downPayment = usesMortgage ? roundMoney(multiplyMoney(purchasePrice, downPaymentRate)) : purchasePrice
  const loanPrincipal = usesMortgage ? roundMoney(subtractMoney(purchasePrice, downPayment)) : 0
  const originalLoanPrincipal = loanPrincipal
  const closingCosts = roundMoney(multiplyMoney(purchasePrice, toRate(inputs.closingCostsPercent)))
  const monthlyMortgagePayment = usesMortgage ? getMonthlyMortgagePayment(loanPrincipal, mortgageRate, termYears) : 0

  const avoidedUpfrontInvestment = usesMortgage
    ? roundMoney(addMoney(downPayment, closingCosts))
    : roundMoney(addMoney(purchasePrice, closingCosts))

  const monthlyHomeownersInsurance = divideMoney(inputs.homeownersInsuranceAnnual, MONTHS_PER_YEAR)
  const monthlyRentersInsurance = divideMoney(inputs.rentersInsuranceAnnual, MONTHS_PER_YEAR)
  const monthlyHoa = roundMoney(inputs.hoaMonthly)

  let remainingBalance = loanPrincipal
  let homeValue = purchasePrice
  let monthlyRent = roundMoney(inputs.monthlyRent)
  let investedPortfolio = avoidedUpfrontInvestment
  let ownCumulativeCost = closingCosts
  let rentCumulativeCost = 0

  const rows: RentVsBuyYearRow[] = []

  for (let year = 1; year <= horizonYears; year += 1) {
    const annualPropertyTax = roundMoney(multiplyMoney(homeValue, propertyTaxRate))
    const annualMaintenance = roundMoney(multiplyMoney(homeValue, maintenanceRate))
    const monthlyPropertyTax = divideMoney(annualPropertyTax, MONTHS_PER_YEAR)
    const monthlyMaintenance = divideMoney(annualMaintenance, MONTHS_PER_YEAR)

    let annualMortgageInterest = 0
    let annualOwnCashOutflow = 0
    let annualRentCashOutflow = 0

    for (let month = 0; month < MONTHS_PER_YEAR; month += 1) {
      let interestPayment = 0
      let principalPayment = 0
      let mortgagePayment = 0

      if (remainingBalance > 0 && monthlyMortgagePayment > 0) {
        interestPayment = roundMoney(multiplyMoney(remainingBalance, mortgageRate / MONTHS_PER_YEAR))
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

    const deductibleMortgageInterest = getDeductibleMortgageInterest(annualMortgageInterest, originalLoanPrincipal)
    const deductiblePropertyTax = Math.min(annualPropertyTax, SALT_CAP)
    const itemizedDeduction = roundMoney(addMoney(deductibleMortgageInterest, deductiblePropertyTax))
    const standardDeduction = getStandardDeduction(latestTaxYear + year - 1, inputs.filingStatus)
    const taxBenefit = standardDeduction > 0 && itemizedDeduction > standardDeduction
      ? roundMoney(multiplyMoney(subtractMoney(itemizedDeduction, standardDeduction), marginalTaxRate))
      : 0

    const annualOwnEconomicCostBeforeTax = sumMoney([
      annualMortgageInterest,
      annualPropertyTax,
      annualMaintenance,
      roundMoney(multiplyMoney(monthlyHoa, MONTHS_PER_YEAR)),
      roundMoney(inputs.homeownersInsuranceAnnual),
    ])
    const annualOwnEconomicCost = roundMoney(subtractMoney(annualOwnEconomicCostBeforeTax, taxBenefit))

    const discountedOwnCost = discountMoney(annualOwnEconomicCost, inflationRate, year)
    const discountedRentCost = discountMoney(annualRentCashOutflow, inflationRate, year)

    ownCumulativeCost = roundMoney(addMoney(ownCumulativeCost, discountedOwnCost))
    rentCumulativeCost = roundMoney(addMoney(rentCumulativeCost, discountedRentCost))

    const annualSavingsContribution = Math.max(subtractMoney(annualOwnCashOutflow, annualRentCashOutflow), 0)
    investedPortfolio = roundMoney(addMoney(
      multiplyMoney(investedPortfolio, 1 + investmentReturnRate),
      annualSavingsContribution,
    ))

    homeValue = roundMoney(multiplyMoney(homeValue, 1 + appreciationRate))

    const sellingCosts = roundMoney(multiplyMoney(homeValue, sellingCostsRate))
    const sellableEquity = Math.max(
      subtractMoney(subtractMoney(homeValue, sellingCosts), remainingBalance),
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
      netOwnPosition: roundMoney(subtractMoney(discountedEquity, ownCumulativeCost)),
      netRentPosition: roundMoney(subtractMoney(discountedPortfolio, rentCumulativeCost)),
    })

    monthlyRent = roundMoney(multiplyMoney(monthlyRent, 1 + rentIncreaseRate))
  }

  const breakEvenYear = rows.find((row) => row.ownCumulativeCost <= row.rentCumulativeCost)?.year ?? null
  const finalRow = rows.at(-1)

  return {
    rows,
    breakEvenYear,
    finalWealthDelta: finalRow ? roundMoney(subtractMoney(finalRow.homeEquity, finalRow.investedPortfolio)) : 0,
  }
}
