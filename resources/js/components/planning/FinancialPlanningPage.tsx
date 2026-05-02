import type { ReactElement } from 'react'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface CalculatorCard {
  title: string
  description: string
  href: string
  shipped: boolean
}

const CALCULATORS: CalculatorCard[] = [
  {
    title: 'Retirement Contributions',
    description: 'Estimate W-2, self-employed 401(k), Traditional IRA, and Roth IRA contribution room.',
    href: '/financial-planning/retirement-contribution-calculator',
    shipped: true,
  },
  {
    title: 'Rent vs. Buy a Home',
    description: 'Compare cumulative costs, tax treatment, equity, and renter portfolio growth across a home-buying horizon.',
    href: '/financial-planning/rent-vs-buy',
    shipped: true,
  },
]

export default function FinancialPlanningPage(): ReactElement {
  return (
    <Container>
      <MainTitle>Financial Planning</MainTitle>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Interactive worksheets for personal financial planning. No account required — enter your
        numbers and get results instantly.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULATORS.filter((calculator) => calculator.shipped).map((calculator) => (
          <a key={calculator.href} href={calculator.href} className="group block">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">{calculator.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{calculator.description}</CardDescription>
              </CardContent>
            </Card>
          </a>
        ))}

        <Card className="h-full border-dashed opacity-60">
          <CardHeader>
            <CardTitle className="text-base text-muted-foreground">More coming soon</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>Additional planning worksheets are on the way.</CardDescription>
          </CardContent>
        </Card>
      </div>
    </Container>
  )
}
