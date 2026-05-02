'use client'

import type { ReactElement } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function RentVsBuyExplainer(): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assumptions behind this model</CardTitle>
        <CardDescription>This is a planning tool, not financial, tax, or legal advice.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="text-muted-foreground grid gap-3 text-sm leading-6">
          <li>Mortgage amortization is standard fixed-rate amortization. If rate or term is 0, the model treats the purchase as an all-cash purchase.</li>
          <li>Tax benefit is only counted when mortgage interest plus deductible property tax beats the federal standard deduction for the selected filing status.</li>
          <li>Property-tax deductions are capped at the current $10,000 SALT limit. Mortgage-interest deductions assume the current $750,000 acquisition-debt cap for new loans.</li>
          <li>CA Prop 13 limits the assessed value used for property taxes to 2% annual growth until it catches up with the modeled home value.</li>
          <li>Closing costs are treated as upfront economic cost. Selling costs and estimated capital gains tax are applied when estimating sellable equity at each year-end.</li>
          <li>Home-sale capital gains tax applies the selected tax rate after the homeowner exclusion: $250,000 for single filers and $500,000 for married filing jointly.</li>
          <li>Homeowners insurance, renter&apos;s insurance, and HOA fees grow annually using their own growth-rate inputs. Property tax and maintenance scale with the modeled assessed or market value.</li>
          <li>Rent grows by the rent-increase input each year. Home value and the renter&apos;s portfolio compound annually using the appreciation and investment-return inputs.</li>
          <li>Inflation discounts future costs and wealth into today&apos;s dollars, but it does not automatically inflate fixed nominal expenses like HOA or insurance.</li>
          <li>PMI, tax-credit interactions, moving costs, portfolio tax drag, and scenario overlays are intentionally out of scope for phase 1.</li>
        </ul>
      </CardContent>
    </Card>
  )
}
