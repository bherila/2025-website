import currency from 'currency.js'
import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'

import Container from '@/components/container'
import {
  Callout,
  FormBlock,
  FormLine,
  FormSubLine,
  FormTotalLine,
  InfoTooltip,
} from '@/components/finance/tax-preview-primitives'
import MainTitle from '@/components/MainTitle'
import { SoloSE401kForm } from '@/components/planning/SoloSE401k'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/formatCurrency'
import type { FilingStatus, RetirementContributionInputs, Se401kInputs } from '@/lib/planning/solo401k'
import {
  computeRetirementContributions,
  estimateDeductibleSeTax,
  getRetirementLimitsForYear,
} from '@/lib/planning/solo401k'

import {
  AVAILABLE_YEARS,
  defaultYear,
  parseRetirementContributionUrlState,
  serializeRetirementContributionUrlState,
} from './retirementContributionUrlState'

const DEFAULT_YEAR = defaultYear()

interface FilingStatusOption {
  value: FilingStatus
  label: string
}

const FILING_STATUS_OPTIONS: FilingStatusOption[] = [
  { value: 'single', label: 'Single' },
  { value: 'headOfHousehold', label: 'Head of household' },
  { value: 'marriedFilingJointly', label: 'Married filing jointly' },
  { value: 'qualifyingWidow', label: 'Qualifying surviving spouse' },
  { value: 'marriedFilingSeparately', label: 'Married filing separately' },
]

function parseCurrencyInput(raw: string): number {
  if (!raw) {
    return 0
  }
  const n = currency(raw).value
  return Number.isNaN(n) ? 0 : Math.max(0, n)
}

function moneyInputValue(value: number): string {
  return value ? currency(value).format() : ''
}

function phaseoutLabel(range: { start: number; end: number } | null): string {
  if (range === null) {
    return 'No phaseout applies'
  }

  return `${formatCurrency(range.start)} to ${formatCurrency(range.end)}`
}

interface MoneyFieldProps {
  disabled?: boolean
  id: string
  label: React.ReactNode
  onBlur: () => void
  onChange: (value: string) => void
  value: string
}

function MoneyField({ disabled = false, id, label, onBlur, onChange, value }: MoneyFieldProps): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        {label}
      </Label>
      <Input
        id={id}
        inputMode="numeric"
        placeholder="$0"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  )
}

interface CheckboxFieldProps {
  checked: boolean
  id: string
  label: React.ReactNode
  onCheckedChange: (checked: boolean) => void
}

function CheckboxField({ checked, id, label, onCheckedChange }: CheckboxFieldProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
      />
      <Label htmlFor={id} className="cursor-pointer text-sm leading-snug">
        {label}
      </Label>
    </div>
  )
}

function RetirementContributionPage(): React.ReactElement {
  const initial = useMemo(() => parseRetirementContributionUrlState(window.location.search, DEFAULT_YEAR), [])

  const [year, setYear] = useState(initial.year)
  const [w2IncomeRaw, setW2IncomeRaw] = useState(moneyInputValue(initial.w2Income))
  const [w2PretaxRaw, setW2PretaxRaw] = useState(moneyInputValue(initial.w2Pretax))
  const [w2RothConversionRaw, setW2RothConversionRaw] = useState(moneyInputValue(initial.w2RothConversion))
  const [includeSe, setIncludeSe] = useState(initial.includeSe)
  const [neRaw, setNeRaw] = useState(moneyInputValue(initial.ne))
  const [seRaw, setSeRaw] = useState(moneyInputValue(initial.se))
  const [catchup, setCatchup] = useState(initial.catchup)
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(initial.filingStatus)
  const [magiRaw, setMagiRaw] = useState(moneyInputValue(initial.magi))
  const [taxpayerCovered, setTaxpayerCovered] = useState(initial.taxpayerCovered)
  const [spouseCovered, setSpouseCovered] = useState(initial.spouseCovered)
  const [tradIraRaw, setTradIraRaw] = useState(moneyInputValue(initial.tradIra))
  const [rothIraRaw, setRothIraRaw] = useState(moneyInputValue(initial.rothIra))
  const [autoSe, setAutoSe] = useState(initial.ne > 0 && !initial.se)

  const w2Income = parseCurrencyInput(w2IncomeRaw)
  const w2Pretax = parseCurrencyInput(w2PretaxRaw)
  const w2RothConversion = parseCurrencyInput(w2RothConversionRaw)
  const ne = parseCurrencyInput(neRaw)
  const seManual = parseCurrencyInput(seRaw)
  const se = includeSe && autoSe ? estimateDeductibleSeTax(ne, year) : seManual
  const magi = parseCurrencyInput(magiRaw)
  const tradIra = parseCurrencyInput(tradIraRaw)
  const rothIra = parseCurrencyInput(rothIraRaw)
  const limits = getRetirementLimitsForYear(year)

  const inputs: RetirementContributionInputs = {
    year,
    w2Income,
    w2EmployeePretaxDeferred: w2Pretax,
    w2PretaxInPlanRothConversion: w2RothConversion,
    includeSelfEmploymentIncome: includeSe,
    includeCatchup: catchup,
    netEarningsFromSE: ne,
    deductibleSeTax: se,
    filingStatus,
    magi,
    taxpayerCoveredByWorkplacePlan: taxpayerCovered,
    spouseCoveredByWorkplacePlan: spouseCovered,
    traditionalIraContribution: tradIra,
    rothIraContribution: rothIra,
  }

  const lines = computeRetirementContributions(inputs)
  const se401kInputs: Se401kInputs = {
    year,
    netEarningsFromSE: includeSe ? ne : 0,
    deductibleSeTax: includeSe ? se : 0,
    w2EmployeePretaxDeferred: w2Pretax,
  }

  useEffect(() => {
    const qs = serializeRetirementContributionUrlState({
      year,
      w2Income,
      w2Pretax,
      w2RothConversion,
      includeSe,
      ne,
      se: includeSe && autoSe ? 0 : seManual,
      catchup,
      filingStatus,
      magi,
      taxpayerCovered,
      spouseCovered,
      tradIra,
      rothIra,
    })
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ''}`
    window.history.replaceState(null, '', newUrl)
  }, [
    autoSe,
    catchup,
    filingStatus,
    includeSe,
    magi,
    ne,
    rothIra,
    seManual,
    spouseCovered,
    taxpayerCovered,
    tradIra,
    w2Income,
    w2Pretax,
    w2RothConversion,
    year,
  ])

  function formatRaw(setValue: (value: string) => void, value: number): void {
    if (value > 0) {
      setValue(currency(value).format())
    }
  }

  return (
    <Container>
      <MainTitle>Retirement Contribution Calculator</MainTitle>
      <p className="mb-6 max-w-3xl text-muted-foreground">
        Estimate W-2, self-employed 401(k), Traditional IRA, and Roth IRA contribution room for a
        tax year. Results update as you type; copy the URL to save your scenario.
      </p>

      <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Inputs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="year">Tax year</Label>
              <select
                id="year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {AVAILABLE_YEARS.map((availableYear) => (
                  <option key={availableYear} value={availableYear}>
                    {availableYear}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-4 border-t pt-5">
              <h2 className="text-sm font-semibold">W-2 income</h2>
              <MoneyField
                id="w2Income"
                label="W-2 wages"
                value={w2IncomeRaw}
                onChange={setW2IncomeRaw}
                onBlur={() => formatRaw(setW2IncomeRaw, w2Income)}
              />
              <MoneyField
                id="w2Pretax"
                label={(
                  <>
                    W-2 pre-tax already deferred this year
                    <InfoTooltip>
                      Counts against the shared 402(g) elective deferral limit and the overall
                      415(c) annual additions cap.
                    </InfoTooltip>
                  </>
                )}
                value={w2PretaxRaw}
                onChange={setW2PretaxRaw}
                onBlur={() => formatRaw(setW2PretaxRaw, w2Pretax)}
              />
              <MoneyField
                id="w2RothConversion"
                label={(
                  <>
                    W-2 pre-tax in-plan Roth conversion
                    <InfoTooltip>
                      Informational only here. The pre-tax deferral already used contribution room
                      when it was contributed, so this conversion is not subtracted a second time.
                    </InfoTooltip>
                  </>
                )}
                value={w2RothConversionRaw}
                onChange={setW2RothConversionRaw}
                onBlur={() => formatRaw(setW2RothConversionRaw, w2RothConversion)}
              />
            </div>

            <div className="space-y-4 border-t pt-5">
              <CheckboxField
                id="includeSe"
                checked={includeSe}
                onCheckedChange={setIncludeSe}
                label="Include self-employment income"
              />
              <MoneyField
                id="ne"
                label="Net SE earnings (Schedule SE line 6)"
                value={neRaw}
                disabled={!includeSe}
                onChange={setNeRaw}
                onBlur={() => formatRaw(setNeRaw, ne)}
              />
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="se" className="flex items-center gap-1.5">
                    Deductible 1/2 of SE tax
                    <InfoTooltip>
                      Reduces the self-employed compensation base before calculating the 20%
                      employer contribution.
                    </InfoTooltip>
                  </Label>
                  <button
                    type="button"
                    disabled={!includeSe}
                    className="text-xs text-primary underline underline-offset-2 disabled:pointer-events-none disabled:opacity-50"
                    onClick={() => {
                      setAutoSe((nextAutoSe) => {
                        const next = !nextAutoSe
                        if (next) {
                          setSeRaw('')
                        }
                        return next
                      })
                    }}
                  >
                    {autoSe ? 'Enter manually' : 'Estimate for me'}
                  </button>
                </div>
                {autoSe && includeSe ? (
                  <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Estimated: {formatCurrency(se)}
                    <span className="ml-1 text-xs">
                      SS 12.4% to {formatCurrency(limits.ssWageBase)} wage base + Medicare 2.9%,
                      halved.
                    </span>
                  </p>
                ) : (
                  <Input
                    id="se"
                    inputMode="numeric"
                    placeholder="$0"
                    value={seRaw}
                    disabled={!includeSe}
                    onChange={(e) => setSeRaw(e.target.value)}
                    onBlur={() => formatRaw(setSeRaw, seManual)}
                  />
                )}
              </div>
              <CheckboxField
                id="catchup"
                checked={catchup}
                onCheckedChange={setCatchup}
                label="Age 50 or older (catch-up eligible)"
              />
            </div>

            <div className="space-y-4 border-t pt-5">
              <h2 className="text-sm font-semibold">IRA contributions</h2>
              <div className="space-y-1.5">
                <Label htmlFor="filingStatus">Filing status</Label>
                <select
                  id="filingStatus"
                  value={filingStatus}
                  onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
                  className="border-input bg-background h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {FILING_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <MoneyField
                id="magi"
                label={(
                  <>
                    MAGI
                    <InfoTooltip>
                      Used to estimate Roth IRA eligibility and Traditional IRA deduction
                      phaseouts.
                    </InfoTooltip>
                  </>
                )}
                value={magiRaw}
                onChange={setMagiRaw}
                onBlur={() => formatRaw(setMagiRaw, magi)}
              />
              <CheckboxField
                id="taxpayerCovered"
                checked={taxpayerCovered}
                onCheckedChange={setTaxpayerCovered}
                label="Covered by a workplace retirement plan"
              />
              <CheckboxField
                id="spouseCovered"
                checked={spouseCovered}
                onCheckedChange={setSpouseCovered}
                label="Spouse covered by a workplace retirement plan"
              />
              <MoneyField
                id="tradIra"
                label="Traditional IRA contribution"
                value={tradIraRaw}
                onChange={setTradIraRaw}
                onBlur={() => formatRaw(setTradIraRaw, tradIra)}
              />
              <MoneyField
                id="rothIra"
                label="Roth IRA contribution"
                value={rothIraRaw}
                onChange={setRothIraRaw}
                onBlur={() => formatRaw(setRothIraRaw, rothIra)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Contribution summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Eligible compensation</p>
                <p className="font-mono text-lg tabular-nums">{formatCurrency(lines.eligibleCompensation)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">Self-employed 401(k)</p>
                <p className="font-mono text-lg tabular-nums">{formatCurrency(lines.se401kTotalWithCatchup)}</p>
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">IRA contribution limit</p>
                <p className="font-mono text-lg tabular-nums">{formatCurrency(lines.ira.contributionLimit)}</p>
              </div>
            </CardContent>
          </Card>

          <SoloSE401kForm inputs={se401kInputs} readOnly />

          {catchup && includeSe && ne > 0 && (
            <Card>
              <CardContent className="space-y-1 pt-2">
                <p className="text-sm font-medium">With age 50+ catch-up</p>
                <p className="text-xs text-muted-foreground">
                  Potential extra employee deferral: {formatCurrency(lines.se401kCatchupAddition)}. Catch-up
                  sits outside the 415(c) cap, so the possible self-employed 401(k) total is{' '}
                  {formatCurrency(lines.se401kTotalWithCatchup)}.
                </p>
              </CardContent>
            </Card>
          )}

          <FormBlock title="IRA contribution limits">
            <FormLine
              label={(
                <>
                  Eligible compensation
                  <InfoTooltip>
                    W-2 wages plus included self-employment compensation. IRA contributions cannot
                    exceed eligible compensation.
                  </InfoTooltip>
                </>
              )}
              value={lines.ira.eligibleCompensation}
            />
            <FormLine label={`${year} IRA limit`} value={lines.ira.annualLimit} />
            <FormTotalLine label="IRA contribution limit" value={lines.ira.contributionLimit} />
            <FormLine label="Traditional IRA entered" value={tradIra} />
            <FormLine label="Roth IRA entered" value={rothIra} />
            <FormTotalLine label="Excess over combined IRA limit" value={lines.ira.excessContribution} />
            <FormLine
              label={(
                <>
                  Roth IRA MAGI phaseout
                  <InfoTooltip>
                    Estimate based on filing status and MAGI. Actual tax forms may apply rounding
                    and ordering details.
                  </InfoTooltip>
                </>
              )}
              raw={phaseoutLabel(lines.ira.rothPhaseoutRange)}
            />
            <FormLine label="Estimated Roth IRA allowed" value={lines.ira.rothAllowedContribution} />
            <FormLine label="Estimated Roth excess" value={lines.ira.rothExcessContribution} />
            <FormLine
              label={(
                <>
                  Traditional IRA deduction phaseout
                  <InfoTooltip>
                    The contribution may still be allowed even when the deductible amount is phased
                    down.
                  </InfoTooltip>
                </>
              )}
              raw={phaseoutLabel(lines.ira.traditionalDeductionPhaseoutRange)}
            />
            <FormLine label="Estimated Traditional IRA deductible" value={lines.ira.traditionalDeductibleAmount} />
            <FormLine label="Estimated Traditional IRA nondeductible" value={lines.ira.traditionalNondeductibleAmount} />
            <FormSubLine text="IRA phaseout results are estimates for planning, not a substitute for the tax-return worksheet." />
          </FormBlock>

          {w2RothConversion > 0 && (
            <Callout kind="info" title="W-2 Roth conversion tracked">
              <p>
                The {formatCurrency(w2RothConversion)} in-plan Roth conversion is shown for tax
                context only. It does not reduce contribution room again.
              </p>
            </Callout>
          )}

          {lines.ira.excessContribution > 0 && (
            <Callout kind="warn" title="IRA contribution exceeds the combined limit">
              <p>
                Traditional and Roth IRA contributions share one annual limit. The entered
                contributions exceed the current estimate by {formatCurrency(lines.ira.excessContribution)}.
              </p>
            </Callout>
          )}

          <Card>
            <CardContent className="space-y-2 pt-2">
              <p className="text-sm font-medium">Self-employed 401(k) employer rate</p>
              <p className="text-xs text-muted-foreground">
                IRS Pub 560 shows a 25% employer contribution rate for W-2 wages. For
                self-employed individuals, the equivalent rate is <strong>20%</strong> of net
                self-employment earnings after subtracting the deductible half of SE tax.
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
    <RetirementContributionPage />
  </React.StrictMode>,
)
