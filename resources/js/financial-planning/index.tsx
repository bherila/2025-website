import React from 'react'
import ReactDOM from 'react-dom/client'

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
    title: 'Solo 401(k) Contributions',
    description: 'Compute your Solo 401(k) employee deferral and employer contribution room using IRS Pub 560 rules.',
    href: '/financial-planning/solo-401k',
    shipped: true,
  },
]

function FinancialPlanningPage() {
  return (
    <Container>
      <MainTitle>Financial Planning</MainTitle>
      <p className="text-muted-foreground mb-8 max-w-2xl">
        Interactive worksheets for personal financial planning. No account required — enter your
        numbers and get results instantly.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULATORS.filter((c) => c.shipped).map((calc) => (
          <a key={calc.href} href={calc.href} className="group block">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="text-base">{calc.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{calc.description}</CardDescription>
              </CardContent>
            </Card>
          </a>
        ))}

        {/* "More coming" tile */}
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

const root = ReactDOM.createRoot(document.getElementById('app') as HTMLElement)
root.render(
  <React.StrictMode>
    <FinancialPlanningPage />
  </React.StrictMode>,
)
