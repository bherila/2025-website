import currency from 'currency.js'
import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'

import Container from '@/components/container'
import MainTitle from '@/components/MainTitle'
import { SoloSE401kForm } from '@/components/planning/SoloSE401k'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/formatCurrency'
import type { Se401kInputs } from '@/lib/planning/solo401k'
import { estimateDeductibleSeTax, getLimitsForYear, SE_401K_LIMITS } from '@/lib/planning/solo401k'

const AVAILABLE_YEARS = Object.keys(SE_401K_LIMITS)
  .map(Number)
  .sort((a, b) => b - a)

const CURRENT_YEAR = new Date().getFullYear()
const DEFAULT_YEAR = AVAILABLE_YEARS.includes(CURRENT_YEAR) ? CURRENT_YEAR : AVAILABLE_YEARS[0]!

// ── URL query-param serialization ─────────────────────────────────────────────

interface UrlParams {
  year: number
  ne: number
  se: number
  w2: number
  catchup: boolean
}

function parseUrlParams(): UrlParams {
  const params = new URLSearchParams(window.location.search)
  const year = parseInt(params.get('year') ?? '', 10)
  return {
    year: AVAILABLE_YEARS.includes(year) ? year : DEFAULT_YEAR!,
    ne: parseDollar(params.get('ne')),
    se: parseDollar(params.get('se')),
    w2: parseDollar(params.get('w2')),
    catchup: params.get('catchup') === '1',
  }
}

function serializeUrlParams(p: UrlParams): string {
  const params = new URLSearchParams()
  params.set('year', String(p.year))
  if (p.ne) params.set('ne', String(p.ne))
  if (p.se) params.set('se', String(p.se))
  if (p.w2) params.set('w2', String(p.w2))
  if (p.catchup) params.set('catchup', '1')
  return params.toString()
}

function parseDollar(raw: string | null): number {
  if (!raw) return 0
  const n = currency(raw).value
  return isNaN(n) ? 0 : Math.max(0, n)
}

// ── Input helpers ─────────────────────────────────────────────────────────────

function parseCurrencyInput(raw: string): number {
  return parseDollar(raw.replace(/[^0-9.]/g, ''))
}

// ── Page component ─────────────────────────────────────────────────────────────

function Solo401kPage() {
  const initial = parseUrlParams()

  const [year, setYear] = useState(initial.year)
  const [neRaw, setNeRaw] = useState(initial.ne ? currency(initial.ne).format() : '')
  const [seRaw, setSeRaw] = useState(initial.se ? currency(initial.se).format() : '')
  const [w2Raw, setW2Raw] = useState(initial.w2 ? currency(initial.w2).format() : '')
  const [catchup, setCatchup] = useState(initial.catchup)
  const [autoSe, setAutoSe] = useState(!initial.se && initial.ne > 0)

  const ne = parseCurrencyInput(neRaw)
  const seManual = parseCurrencyInput(seRaw)
  const se = autoSe ? estimateDeductibleSeTax(ne) : seManual
  const w2 = parseCurrencyInput(w2Raw)

  const limits = getLimitsForYear(year)

  const inputs: Se401kInputs = {
    year,
    netEarningsFromSE: ne,
    deductibleSeTax: se,
    w2EmployeePretaxDeferred: w2,
  }

  // Sync URL whenever inputs change.
  useEffect(() => {
    const qs = serializeUrlParams({ year, ne, se: autoSe ? 0 : seManual, w2, catchup })
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    window.history.replaceState(null, '', newUrl)
  }, [year, ne, seManual, autoSe, w2, catchup])

  function handleNeBlur() {
    if (ne > 0) setNeRaw(currency(ne).format())
  }

  function handleSeBlur() {
    if (seManual > 0) setSeRaw(currency(seManual).format())
  }

  function handleW2Blur() {
    if (w2 > 0) setW2Raw(currency(w2).format())
  }

  return (
    <Container>
      <MainTitle>Solo 401(k) Contribution Calculator</MainTitle>
      <p className="text-muted-foreground mb-6 max-w-2xl">
        Compute your Solo 401(k) contribution room using IRS Pub 560 rules. Works for Schedule C
        sole proprietors and self-employed partners. Results update as you type; copy the URL to
        save your scenario.
      </p>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        {/* Inputs */}
        <Card>
          <CardContent className="space-y-5 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="year">Tax year</Label>
              <select
                id="year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2"
              >
                {AVAILABLE_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ne">Net SE earnings (Schedule SE line 6)</Label>
              <Input
                id="ne"
                inputMode="numeric"
                placeholder="$0"
                value={neRaw}
                onChange={(e) => {
                  setNeRaw(e.target.value)
                  setAutoSe(false)
                }}
                onBlur={handleNeBlur}
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="se">Deductible ½ of SE tax (Schedule 1 line 15)</Label>
                <button
                  type="button"
                  className="text-xs text-primary underline underline-offset-2"
                  onClick={() => {
                    setAutoSe((v) => {
                      const next = !v
                      if (next) setSeRaw('')
                      return next
                    })
                  }}
                >
                  {autoSe ? 'Enter manually' : 'Estimate for me'}
                </button>
              </div>
              {autoSe ? (
                <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Estimated: {formatCurrency(se)}
                  <span className="ml-1 text-xs">(net × 92.35% × 15.3% ÷ 2)</span>
                </p>
              ) : (
                <Input
                  id="se"
                  inputMode="numeric"
                  placeholder="$0"
                  value={seRaw}
                  onChange={(e) => setSeRaw(e.target.value)}
                  onBlur={handleSeBlur}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="w2">W-2 pre-tax 401(k) already deferred this year</Label>
              <Input
                id="w2"
                inputMode="numeric"
                placeholder="$0"
                value={w2Raw}
                onChange={(e) => setW2Raw(e.target.value)}
                onBlur={handleW2Blur}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="catchup"
                type="checkbox"
                checked={catchup}
                onChange={(e) => setCatchup(e.target.checked)}
                className="h-4 w-4 rounded border"
              />
              <Label htmlFor="catchup" className="cursor-pointer">
                Age 50 or older (catch-up eligible)
              </Label>
            </div>

            {catchup && (
              <p className="text-xs text-muted-foreground -mt-3">
                Age 50+ catch-up allows an additional{' '}
                {formatCurrency(limits.catchUpAge50)} in employee deferrals.
                This is shown in the results below.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          <SoloSE401kForm inputs={inputs} readOnly />

          {catchup && ne > 0 && (
            <Card>
              <CardContent className="pt-2">
                <p className="text-sm font-medium mb-1">With age 50+ catch-up</p>
                <p className="text-xs text-muted-foreground">
                  You may contribute an additional{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(limits.catchUpAge50)}
                  </span>{' '}
                  in employee elective deferrals (§402(g) catch-up). This is on top of the
                  recommended contribution shown above, bringing your potential total to{' '}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(
                      currency(
                        Math.min(
                          currency(inputs.netEarningsFromSE).subtract(inputs.deductibleSeTax).value,
                          inputs.netEarningsFromSE > 0
                            ? Infinity
                            : 0,
                        ),
                      ).value,
                    )}
                  </span>.
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-2 space-y-2">
              <p className="text-sm font-medium">20% vs 25% employer rate</p>
              <p className="text-xs text-muted-foreground">
                IRS Pub 560 shows a 25% employer contribution rate, but that rate applies to W-2
                wages. For self-employed individuals, the effective rate is <strong>20%</strong>{' '}
                of net self-employment earnings after subtracting the deductible half of SE tax.
                The math is equivalent — the 5-point difference accounts for the fact that the
                contribution reduces the base it is computed from.
              </p>
              <a
                href="https://www.irs.gov/pub/irs-pdf/p560.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline underline-offset-2"
              >
                IRS Publication 560 (PDF)
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  )
}

const root = ReactDOM.createRoot(document.getElementById('app') as HTMLElement)
root.render(
  <React.StrictMode>
    <Solo401kPage />
  </React.StrictMode>,
)
