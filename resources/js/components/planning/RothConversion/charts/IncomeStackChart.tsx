import currency from 'currency.js'
import { type ReactElement } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { RothConversionYear } from '../types'

interface IncomeStackChartProps {
  years: RothConversionYear[]
}

interface IncomeStackPoint {
  age: number
  wages: number
  selfEmployment: number
  interest: number
  otherOrdinary: number
  rmd: number
  rothConversion: number
  taxableSocialSecurity: number
  magi: number
  irmaaCeiling: number | null
}

function formatMoney(value: number | string): string {
  return currency(value, { precision: 0 }).format()
}

export default function IncomeStackChart({ years }: IncomeStackChartProps): ReactElement {
  const data: IncomeStackPoint[] = years.map((year) => ({
    age: year.primaryAge,
    wages: year.ordinaryIncomeStack.wages,
    selfEmployment: year.ordinaryIncomeStack.selfEmployment,
    interest: year.ordinaryIncomeStack.interest,
    otherOrdinary: year.ordinaryIncomeStack.otherOrdinary,
    rmd: year.ordinaryIncomeStack.rmd,
    rothConversion: year.ordinaryIncomeStack.rothConversion,
    taxableSocialSecurity: year.ordinaryIncomeStack.taxableSocialSecurity,
    magi: year.magi,
    irmaaCeiling: year.irmaaTier.maxMagi,
  }))
  const firstCeiling = data.find((point) => point.irmaaCeiling !== null)?.irmaaCeiling ?? undefined

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="age" allowDecimals={false} />
        <YAxis tickFormatter={(value: number) => formatMoney(value)} width={84} />
        <Tooltip formatter={(value) => formatMoney(value as number | string)} labelFormatter={(value) => `Age ${value}`} />
        {firstCeiling ? <ReferenceLine y={firstCeiling} stroke="#dc2626" strokeDasharray="4 4" label="IRMAA" /> : null}
        <Area type="monotone" dataKey="wages" stackId="income" name="Wages" stroke="#2563eb" fill="#2563eb" fillOpacity={0.55} />
        <Area type="monotone" dataKey="selfEmployment" stackId="income" name="SE income" stroke="#0891b2" fill="#0891b2" fillOpacity={0.55} />
        <Area type="monotone" dataKey="interest" stackId="income" name="Interest" stroke="#16a34a" fill="#16a34a" fillOpacity={0.55} />
        <Area type="monotone" dataKey="otherOrdinary" stackId="income" name="Other ordinary" stroke="#ca8a04" fill="#ca8a04" fillOpacity={0.55} />
        <Area type="monotone" dataKey="rmd" stackId="income" name="RMD" stroke="#ea580c" fill="#ea580c" fillOpacity={0.6} />
        <Area type="monotone" dataKey="rothConversion" stackId="income" name="Roth conversion" stroke="#9333ea" fill="#9333ea" fillOpacity={0.6} />
        <Area type="monotone" dataKey="taxableSocialSecurity" stackId="income" name="Taxable SS" stroke="#64748b" fill="#64748b" fillOpacity={0.55} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
