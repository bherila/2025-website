'use client'

import currency from 'currency.js'
import type { ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from '@/components/ui/table'
import type { RentVsBuyYearRow } from '@/lib/planning/rentVsBuy'

export type RentVsBuyDetailSection = 'buy-costs' | 'rent-costs' | 'buyer-portfolio' | 'buyer-wealth' | 'renter-portfolio'

interface RentVsBuyDetailsModalProps {
  row: RentVsBuyYearRow | null
  section: RentVsBuyDetailSection | null
  onClose: () => void
}

interface DetailLine {
  label: string
  value: number
  kind?: 'normal' | 'subtotal' | 'negative'
}

interface DetailGroup {
  title: string
  lines: DetailLine[]
}

function formatMoney(value: number): string {
  return currency(value, { precision: 0 }).format()
}

function getModalTitle(section: RentVsBuyDetailSection, year: number): string {
  const labels: Record<RentVsBuyDetailSection, string> = {
    'buy-costs': 'Buying nonrecoverable costs',
    'rent-costs': 'Renting nonrecoverable costs',
    'buyer-portfolio': 'Buyer invested portfolio',
    'buyer-wealth': 'Buyer total wealth',
    'renter-portfolio': 'Renter invested portfolio',
  }

  return `${labels[section]} - Year ${year}`
}

function getModalDescription(section: RentVsBuyDetailSection): string {
  if (section === 'buyer-wealth') {
    return 'Present-dollar total wealth if the buyer sells the home at this point in time.'
  }

  if (section === 'buy-costs' || section === 'rent-costs') {
    return 'Cumulative present-dollar costs that are not recovered as an asset.'
  }

  return 'Present-dollar portfolio value from invested cash-flow differences and compounded investment growth.'
}

function getDetailGroups(row: RentVsBuyYearRow, section: RentVsBuyDetailSection): DetailGroup[] {
  if (section === 'buy-costs') {
    return [{
      title: 'Cumulative cost components',
      lines: [
        { label: 'Closing costs', value: row.buyNonrecoverableCosts.closingCosts },
        { label: 'Mortgage interest', value: row.buyNonrecoverableCosts.mortgageInterest },
        { label: 'Property tax', value: row.buyNonrecoverableCosts.propertyTax },
        { label: 'Maintenance', value: row.buyNonrecoverableCosts.maintenance },
        { label: 'HOA / condo fees', value: row.buyNonrecoverableCosts.hoa },
        { label: 'Homeowners insurance', value: row.buyNonrecoverableCosts.homeownersInsurance },
        { label: 'Tax benefit from itemizing', value: row.buyNonrecoverableCosts.taxBenefit, kind: 'negative' },
        { label: 'Total nonrecoverable cost', value: row.buyNonrecoverableCosts.total, kind: 'subtotal' },
      ],
    }]
  }

  if (section === 'rent-costs') {
    return [{
      title: 'Cumulative cost components',
      lines: [
        { label: 'Rent paid', value: row.rentNonrecoverableCosts.rent },
        { label: "Renter's insurance", value: row.rentNonrecoverableCosts.rentersInsurance },
        { label: 'Total nonrecoverable cost', value: row.rentNonrecoverableCosts.total, kind: 'subtotal' },
      ],
    }]
  }

  if (section === 'buyer-portfolio') {
    return [{
      title: 'Portfolio components',
      lines: [
        { label: 'Starting balance', value: row.buyerPortfolio.startingBalance },
        { label: 'Cash-flow savings invested', value: row.buyerPortfolio.cashFlowContributions },
        { label: 'Investment growth', value: row.buyerPortfolio.investmentGrowth },
        { label: 'Portfolio value', value: row.buyerPortfolio.total, kind: 'subtotal' },
      ],
    }]
  }

  if (section === 'renter-portfolio') {
    return [{
      title: 'Portfolio components',
      lines: [
        { label: 'Upfront purchase cash invested', value: row.renterPortfolio.startingBalance },
        { label: 'Cash-flow savings invested', value: row.renterPortfolio.cashFlowContributions },
        { label: 'Investment growth', value: row.renterPortfolio.investmentGrowth },
        { label: 'Portfolio value', value: row.renterPortfolio.total, kind: 'subtotal' },
      ],
    }]
  }

  return [
    {
      title: 'Home sale cash',
      lines: [
        { label: 'Home market value', value: row.homeSale.homeValue },
        { label: 'Selling costs', value: row.homeSale.sellingCosts, kind: 'negative' },
        { label: 'Capital gains tax', value: row.homeSale.capitalGainsTax, kind: 'negative' },
        { label: 'Mortgage payoff', value: row.homeSale.mortgagePayoff, kind: 'negative' },
        { label: 'Cash received at sale', value: row.homeSale.netSaleCash, kind: 'subtotal' },
      ],
    },
    {
      title: 'Buyer wealth',
      lines: [
        { label: 'Cash received at sale', value: row.homeSale.netSaleCash },
        { label: 'Buyer invested portfolio', value: row.buyerPortfolio.total },
        { label: 'Buyer total wealth', value: row.buyerTotalWealth, kind: 'subtotal' },
      ],
    },
  ]
}

function DetailGroupTable({ group }: { group: DetailGroup }): ReactElement {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-semibold">{group.title}</h3>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableBody>
            {group.lines.map((line) => (
              <TableRow key={line.label} className={line.kind === 'subtotal' ? 'bg-muted/60 font-medium' : undefined}>
                <TableCell>{line.label}</TableCell>
                <TableCell className="text-right">
                  {line.kind === 'negative' && line.value > 0 ? '-' : ''}
                  {formatMoney(line.value)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

export default function RentVsBuyDetailsModal({ row, section, onClose }: RentVsBuyDetailsModalProps): ReactElement | null {
  if (!row || !section) {
    return null
  }

  const detailGroups = getDetailGroups(row, section)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{getModalTitle(section, row.year)}</DialogTitle>
          <DialogDescription>{getModalDescription(section)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {detailGroups.map((group) => (
            <DetailGroupTable key={group.title} group={group} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
