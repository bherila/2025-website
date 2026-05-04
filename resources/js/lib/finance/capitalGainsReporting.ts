import currency from 'currency.js'

import type { Form8949Box, Form8949Lot } from '@/components/finance/Form8949Preview'
import {
  accountLast4FromValue,
  broker1099TransactionsToLots,
  isBroker1099DocumentType,
  isBroker1099EntryType,
  normalizeForm8949Box,
} from '@/lib/finance/form8949Extraction'
import { parseMoney } from '@/lib/finance/money'
import type { ScheduleDBrokerLine } from '@/lib/finance/scheduleDBrokerGains'
import { brokerEntryMatchesLink } from '@/lib/finance/taxDocumentUtils'
import type {
  Broker1099BReportingMode,
  TaxDocument,
  TaxDocumentAccountLink,
} from '@/types/finance/tax-document'
import type { Doc1099ExportEntry } from '@/types/finance/tax-return'

export const REPORTING_MODES = ['schedule_d_summary', 'form_8949_summary', 'form_8949_transactions'] as const

export const REPORTING_MODE_LABELS: Record<Broker1099BReportingMode, string> = {
  schedule_d_summary: 'Schedule D Summary',
  form_8949_summary: 'Form 8949 Summary',
  form_8949_transactions: 'Form 8949 Individual Transactions',
}

const BOX_TO_SCHEDULE_D_LINE: Record<Form8949Box, ScheduleDBrokerLine> = {
  A: '1b',
  B: '2',
  C: '3',
  D: '8b',
  E: '9',
  F: '10',
}
const FORM_8949_BOX_ORDER: Record<Form8949Box, number> = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  E: 4,
  F: 5,
}
const ST_GAIN_KEYS = ['b_st_gain_loss', 'b_st_reported_gain_loss'] as const
const LT_GAIN_KEYS = ['b_lt_gain_loss', 'b_lt_reported_gain_loss'] as const
const TOTAL_GAIN_KEYS = ['b_total_gain_loss', 'total_realized_gain_loss'] as const
const TOTAL_AS_ST_FALLBACK_NOTE = 'Used total realized gain/loss as short-term fallback because no ST/LT split was present.'

interface Broker1099BRecord {
  docId?: number
  formType: string
  parsedData: Record<string, unknown>
  link?: Pick<TaxDocumentAccountLink, 'id' | 'account_id' | 'reporting_mode' | 'ai_identifier' | 'ai_account_name' | 'account'> | null
  accountId?: number | null | undefined
  accountName?: string | null
  accountLast4?: string | null
  label: string
}

interface BoxSummaryTotals {
  proceeds: currency
  basis: currency
  gain: currency
  washSale: currency
  accruedMarketDiscount: currency
}

export interface CapitalGainsReportSource {
  line: ScheduleDBrokerLine
  label: string
  amount: number
  note?: string
  form8949Box?: Form8949Box
  reportingMode: Broker1099BReportingMode
  detail?: { formLabel: string; docId: number }
}

function reportingModeNote(mode: Broker1099BReportingMode, box?: Form8949Box): string {
  if (mode === 'schedule_d_summary') {
    return 'Reporting mode: Schedule D Summary'
  }

  return mode === 'form_8949_summary'
    ? `Reporting mode: Form 8949 Summary${box ? `, Box ${box}` : ''}`
    : `Reporting mode: Form 8949 Individual Transactions${box ? `, Box ${box}` : ''}`
}

export interface CapitalGainsReport {
  form8949Lots: Form8949Lot[]
  scheduleDLineAmounts: Partial<Record<ScheduleDBrokerLine, number>>
  sources: CapitalGainsReportSource[]
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false
  }
  return null
}

function toNum(value: unknown): number {
  return parseMoney(value) ?? 0
}

function positiveAmount(value: unknown): number {
  return Math.abs(toNum(value))
}

function transactionHasAdjustment(transaction: Record<string, unknown>): boolean {
  const proceeds = toNum(transaction.proceeds)
  const basis = toNum(transaction.cost_basis)
  const reportedGain = parseMoney(transaction.realized_gain_loss)
  const unadjustedGain = currency(proceeds).subtract(basis).value
  return (
    positiveAmount(transaction.wash_sale_disallowed) > 0.005 ||
    positiveAmount(transaction.accrued_market_discount) > 0.005 ||
    (reportedGain !== null && Math.abs(reportedGain - unadjustedGain) > 0.005)
  )
}

function transactionBox(transaction: Record<string, unknown>): Form8949Box | null {
  const explicit = normalizeForm8949Box(transaction.form_8949_box)
  if (explicit) {
    return explicit
  }
  const isShortTerm = toBool(transaction.is_short_term)
  if (isShortTerm === null) {
    return null
  }
  return toBool(transaction.is_covered) === false
    ? isShortTerm ? 'B' : 'E'
    : isShortTerm ? 'A' : 'D'
}

function isDirectScheduleDEligibleTransaction(transaction: Record<string, unknown>): boolean {
  const box = transactionBox(transaction)
  return (
    (box === 'A' || box === 'D') &&
    toBool(transaction.is_covered) !== false &&
    parseMoney(transaction.cost_basis) !== null &&
    !transactionHasAdjustment(transaction)
  )
}

function transactionsFromRecord(parsedData: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(parsedData.transactions)
    ? parsedData.transactions.filter((tx): tx is Record<string, unknown> => isPlainRecord(tx))
    : []
}

function readMoneyField(record: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = parseMoney(record[key])
    if (value !== null) {
      return value
    }
  }

  return null
}

export function scheduleDSummaryEligibility(parsedData: Record<string, unknown>): { eligible: boolean; warnings: string[] } {
  const transactions = transactionsFromRecord(parsedData)
  if (transactions.length === 0) {
    return { eligible: true, warnings: [] }
  }

  const warnings = new Set<string>()
  for (const transaction of transactions) {
    if (positiveAmount(transaction.wash_sale_disallowed) > 0.005) {
      warnings.add('Wash sale adjustments require Form 8949.')
    }
    if (positiveAmount(transaction.accrued_market_discount) > 0.005) {
      warnings.add('Accrued market discount adjustments require Form 8949.')
    }
    if (toBool(transaction.is_covered) === false) {
      warnings.add('Noncovered basis must be reported through Form 8949.')
    }
    if (parseMoney(transaction.cost_basis) === null) {
      warnings.add('Missing basis must be reviewed on Form 8949.')
    }
    const box = transactionBox(transaction)
    if (box !== 'A' && box !== 'D') {
      warnings.add('Only covered Box A/D transactions can use Schedule D summary.')
    }
    if (transactionHasAdjustment(transaction)) {
      warnings.add('Transactions with Form 8949 adjustments cannot use Schedule D summary.')
    }
  }

  return { eligible: transactions.every(isDirectScheduleDEligibleTransaction), warnings: [...warnings] }
}

export function defaultReportingMode(parsedData: Record<string, unknown>): Broker1099BReportingMode {
  return scheduleDSummaryEligibility(parsedData).eligible
    ? 'schedule_d_summary'
    : 'form_8949_transactions'
}

export function effectiveReportingMode(
  parsedData: Record<string, unknown>,
  persistedMode?: Broker1099BReportingMode | null,
): Broker1099BReportingMode {
  if (transactionsFromRecord(parsedData).length === 0) {
    return 'schedule_d_summary'
  }
  if (!persistedMode) {
    return defaultReportingMode(parsedData)
  }
  if (persistedMode === 'schedule_d_summary' && !scheduleDSummaryEligibility(parsedData).eligible) {
    return defaultReportingMode(parsedData)
  }
  return persistedMode
}

function transactionGain(transaction: Record<string, unknown>): number {
  const reported = parseMoney(transaction.realized_gain_loss)
  if (reported === null) {
    return 0
  }

  const washSale = positiveAmount(transaction.wash_sale_disallowed)
  if (washSale <= 0.005) {
    return reported
  }

  const proceeds = toNum(transaction.proceeds)
  const basis = toNum(transaction.cost_basis)
  const unadjustedGain = currency(proceeds).subtract(basis).value

  return Math.abs(reported - unadjustedGain) <= 0.005
    ? currency(reported).add(washSale).value
    : reported
}

function addLineAmount(
  lineAmounts: Partial<Record<ScheduleDBrokerLine, number>>,
  line: ScheduleDBrokerLine,
  amount: number,
): void {
  if (amount === 0) {
    return
  }
  lineAmounts[line] = currency(lineAmounts[line] ?? 0).add(amount).value
}

function lineForTransaction(transaction: Record<string, unknown>, mode: Broker1099BReportingMode): ScheduleDBrokerLine | null {
  const box = transactionBox(transaction)
  if (mode === 'schedule_d_summary') {
    if (box === 'A') {
      return '1a'
    }
    if (box === 'D') {
      return '8a'
    }

    return null
  }
  return box ? BOX_TO_SCHEDULE_D_LINE[box] : null
}

function formLabel(formType: string): string {
  if (formType === '1099_b' || formType === '1099_b_c') {
    return '1099-B'
  }
  return 'Broker 1099'
}

function sourceDescription(transaction: Record<string, unknown>): string {
  const symbol = typeof transaction.symbol === 'string' ? transaction.symbol.trim() : ''
  const description = typeof transaction.description === 'string' ? transaction.description.trim() : ''
  return symbol || description || '1099-B transaction'
}

function summaryLotForBox(
  box: Form8949Box,
  record: Broker1099BRecord,
  transactions: Record<string, unknown>[],
): Form8949Lot {
  const totals = transactions.reduce<BoxSummaryTotals>(
    (acc, transaction) => ({
      proceeds: acc.proceeds.add(toNum(transaction.proceeds)),
      basis: acc.basis.add(toNum(transaction.cost_basis)),
      gain: acc.gain.add(transactionGain(transaction)),
      washSale: acc.washSale.add(positiveAmount(transaction.wash_sale_disallowed)),
      accruedMarketDiscount: acc.accruedMarketDiscount.add(positiveAmount(transaction.accrued_market_discount)),
    }),
    {
      proceeds: currency(0),
      basis: currency(0),
      gain: currency(0),
      washSale: currency(0),
      accruedMarketDiscount: currency(0),
    },
  )
  const codes = ['M']
  if (totals.washSale.value !== 0) {
    codes.push('W')
  }
  if (totals.accruedMarketDiscount.value !== 0) {
    codes.push('D')
  }

  return {
    symbol: null,
    description: `${record.label} summary`,
    quantity: null,
    purchase_date: 'various',
    sale_date: 'various',
    cost_basis: totals.basis.value,
    proceeds: totals.proceeds.value,
    realized_gain_loss: totals.gain.value,
    is_short_term: box === 'A' || box === 'B' || box === 'C',
    lot_source: '1099b',
    tax_document_id: record.docId ?? null,
    form_8949_box: box,
    is_covered: box === 'A' || box === 'D',
    wash_sale_disallowed: totals.washSale.value,
    accrued_market_discount: totals.accruedMarketDiscount.value,
    account_name: record.accountName ?? null,
    account_last4: record.accountLast4 ?? null,
    account_link_id: record.link?.id ?? null,
    adjustment_code: codes.join(','),
  }
}

function addRecordToReport(report: CapitalGainsReport, record: Broker1099BRecord): void {
  const selectedMode = effectiveReportingMode(record.parsedData, record.link?.reporting_mode)
  const transactions = transactionsFromRecord(record.parsedData)

  if (transactions.length === 0) {
    const mode: Broker1099BReportingMode = 'schedule_d_summary'
    const shortTermValue = readMoneyField(record.parsedData, ST_GAIN_KEYS)
    const longTermValue = readMoneyField(record.parsedData, LT_GAIN_KEYS)
    const totalValue = readMoneyField(record.parsedData, TOTAL_GAIN_KEYS)
    const usedTotalAsShortTermFallback = shortTermValue === null && longTermValue === null && totalValue !== null
    const stGain = shortTermValue ?? (usedTotalAsShortTermFallback ? totalValue : 0)
    const ltGain = longTermValue ?? 0
    addLineAmount(report.scheduleDLineAmounts, '1a', stGain)
    addLineAmount(report.scheduleDLineAmounts, '8a', ltGain)
    if (stGain !== 0) {
      report.sources.push({
        line: '1a',
        label: `${record.label} — S/T 1099-B`,
        amount: stGain,
        ...(usedTotalAsShortTermFallback
          ? { note: TOTAL_AS_ST_FALLBACK_NOTE }
          : selectedMode === mode ? {} : { note: 'Reporting mode resolved to Schedule D Summary because this 1099-B has totals but no transaction detail.' }),
        reportingMode: mode,
        ...(record.docId ? { detail: { formLabel: formLabel(record.formType), docId: record.docId } } : {}),
      })
    }
    if (ltGain !== 0) {
      report.sources.push({
        line: '8a',
        label: `${record.label} — L/T 1099-B`,
        amount: ltGain,
        ...(selectedMode === mode ? {} : { note: 'Reporting mode resolved to Schedule D Summary because this 1099-B has totals but no transaction detail.' }),
        reportingMode: mode,
        ...(record.docId ? { detail: { formLabel: formLabel(record.formType), docId: record.docId } } : {}),
      })
    }
    return
  }

  const transactionsByBox = new Map<Form8949Box, Record<string, unknown>[]>()
  const summarySourcesByBox = new Map<Form8949Box, CapitalGainsReportSource>()

  for (const transaction of transactions) {
    const amount = transactionGain(transaction)
    const line = lineForTransaction(transaction, selectedMode)
    const box = transactionBox(transaction)
    if (line) {
      addLineAmount(report.scheduleDLineAmounts, line, amount)
      if (selectedMode === 'form_8949_summary' && box) {
        const existing = summarySourcesByBox.get(box)
        summarySourcesByBox.set(box, {
          line,
          label: `${record.label} — Form 8949 summary Box ${box}`,
          amount: currency(existing?.amount ?? 0).add(amount).value,
          form8949Box: box,
          reportingMode: selectedMode,
          note: reportingModeNote(selectedMode, box),
          ...(record.docId ? { detail: { formLabel: formLabel(record.formType), docId: record.docId } } : {}),
        })
      } else {
        report.sources.push({
          line,
          label: `${record.label} — ${sourceDescription(transaction)}`,
          amount,
          ...(box ? { form8949Box: box } : {}),
          reportingMode: selectedMode,
          ...(record.docId ? { detail: { formLabel: formLabel(record.formType), docId: record.docId } } : {}),
        })
      }
    }

    if (selectedMode === 'form_8949_summary' && box) {
      transactionsByBox.set(box, [...(transactionsByBox.get(box) ?? []), transaction])
    }
  }

  report.sources.push(
    ...[...summarySourcesByBox.values()].sort((a, b) => {
      if (!a.form8949Box || !b.form8949Box) {
        return 0
      }
      return FORM_8949_BOX_ORDER[a.form8949Box] - FORM_8949_BOX_ORDER[b.form8949Box]
    }),
  )

  if (selectedMode === 'form_8949_transactions') {
    report.form8949Lots.push(...broker1099TransactionsToLots(record.parsedData, {
      ...(record.docId !== undefined ? { tax_document_id: record.docId } : {}),
      ...(record.accountId !== null && record.accountId !== undefined ? { acct_id: record.accountId } : {}),
      account_name: record.accountName ?? null,
      account_last4: record.accountLast4 ?? null,
      account_link_id: record.link?.id ?? null,
    }))
  } else if (selectedMode === 'form_8949_summary') {
    for (const [box, boxTransactions] of [...transactionsByBox.entries()].sort(([a], [b]) => FORM_8949_BOX_ORDER[a] - FORM_8949_BOX_ORDER[b])) {
      report.form8949Lots.push(summaryLotForBox(box, record, boxTransactions))
    }
  }
}

function linkMatchesEntry(entry: Record<string, unknown>, link: Pick<TaxDocumentAccountLink, 'ai_identifier' | 'ai_account_name'>): boolean {
  return brokerEntryMatchesLink({
    account_identifier: typeof entry.account_identifier === 'string' ? entry.account_identifier : null,
    account_name: typeof entry.account_name === 'string' ? entry.account_name : null,
  }, link)
}

function recordsFromTaxDocument(doc: TaxDocument, accountId?: number): Broker1099BRecord[] {
  if (!doc.is_reviewed || (doc.form_type !== '1099_b' && doc.form_type !== '1099_b_c' && !isBroker1099DocumentType(doc.form_type))) {
    return []
  }

  if (!isBroker1099DocumentType(doc.form_type)) {
    const parsedData = isPlainRecord(doc.parsed_data) ? doc.parsed_data : null
    if (!parsedData) {
      return []
    }
    const link = (doc.account_links ?? []).find((candidate) => isBroker1099EntryType(candidate.form_type)) ?? null
    const resolvedAccountId = doc.account_id ?? link?.account_id ?? undefined
    if (accountId !== undefined && resolvedAccountId !== accountId) {
      return []
    }
    const accountLast4 = accountLast4FromValue(parsedData.account_number)
      ?? accountLast4FromValue(doc.account?.acct_number)
      ?? accountLast4FromValue(link?.ai_identifier)
      ?? accountLast4FromValue(link?.account?.acct_number)
    return [{
      docId: doc.id,
      formType: doc.form_type,
      parsedData,
      link,
      accountId: resolvedAccountId,
      accountName: doc.account?.acct_name ?? link?.account?.acct_name ?? null,
      accountLast4,
      label: doc.account?.acct_name ?? link?.account?.acct_name ?? (parsedData.payer_name as string | undefined) ?? doc.original_filename ?? '1099-B',
    }]
  }

  if (isPlainRecord(doc.parsed_data)) {
    if (accountId !== undefined && doc.account_id !== accountId) {
      return []
    }
    return [{
      docId: doc.id,
      formType: doc.form_type,
      parsedData: doc.parsed_data,
      accountId: doc.account_id ?? undefined,
      accountName: doc.account?.acct_name ?? null,
      accountLast4: accountLast4FromValue(doc.account?.acct_number),
      label: doc.account?.acct_name ?? (doc.parsed_data.payer_name as string | undefined) ?? doc.original_filename ?? 'Broker 1099',
    }]
  }

  const entries = Array.isArray(doc.parsed_data) ? doc.parsed_data : []
  return entries.flatMap((entry) => {
    if (!isPlainRecord(entry) || !isBroker1099EntryType(entry.form_type) || !isPlainRecord(entry.parsed_data)) {
      return []
    }
    const link = (doc.account_links ?? []).find((candidate) =>
      isBroker1099EntryType(candidate.form_type) && linkMatchesEntry(entry, candidate),
    ) ?? null
    const linkedAccountId = link?.account_id ?? undefined
    if (accountId !== undefined && linkedAccountId !== accountId) {
      return []
    }
    const accountLast4 = accountLast4FromValue(entry.account_identifier)
      ?? accountLast4FromValue(entry.parsed_data.account_number)
      ?? accountLast4FromValue(link?.ai_identifier)
      ?? accountLast4FromValue(link?.account?.acct_number)
    return [{
      docId: doc.id,
      formType: entry.form_type,
      parsedData: entry.parsed_data,
      link,
      accountId: linkedAccountId,
      accountName: typeof entry.account_name === 'string' ? entry.account_name : link?.account?.acct_name ?? null,
      accountLast4,
      label: typeof entry.account_name === 'string' ? entry.account_name : link?.account?.acct_name ?? doc.original_filename ?? '1099-B',
    }]
  })
}

function recordsFromExportDoc(doc: Doc1099ExportEntry): Broker1099BRecord[] {
  if (!isBroker1099DocumentType(doc.formType) && !isBroker1099EntryType(doc.formType)) {
    return []
  }

  if (!Array.isArray(doc.parsedData)) {
    const link = (doc.accountLinks ?? []).find((candidate) => isBroker1099EntryType(candidate.form_type)) ?? null
    return isPlainRecord(doc.parsedData)
      ? [{
          formType: doc.formType,
          parsedData: doc.parsedData,
          link,
          accountId: doc.accountId ?? link?.account_id,
          accountName: doc.accountName ?? link?.account?.acct_name ?? null,
          accountLast4: doc.accountLast4 ?? accountLast4FromValue(link?.account?.acct_number) ?? null,
          label: doc.accountName ?? doc.payerName,
        }]
      : []
  }

  return doc.parsedData.flatMap((entry) => {
    if (!isPlainRecord(entry) || !isBroker1099EntryType(entry.form_type) || !isPlainRecord(entry.parsed_data)) {
      return []
    }
    const link = (doc.accountLinks ?? []).find((candidate) => linkMatchesEntry(entry, candidate)) ?? null
    const accountLast4 = accountLast4FromValue(entry.account_identifier)
      ?? accountLast4FromValue(entry.parsed_data.account_number)
      ?? accountLast4FromValue(link?.ai_identifier)
      ?? accountLast4FromValue(link?.account?.acct_number)
    return [{
      formType: entry.form_type,
      parsedData: entry.parsed_data,
      link,
      accountId: link?.account_id,
      accountName: typeof entry.account_name === 'string' ? entry.account_name : link?.account?.acct_name ?? null,
      accountLast4,
      label: typeof entry.account_name === 'string' ? entry.account_name : link?.account?.acct_name ?? doc.payerName,
    }]
  })
}

export function buildCapitalGainsReportFromTaxDocuments(docs: TaxDocument[], accountId?: number): CapitalGainsReport {
  const report: CapitalGainsReport = { form8949Lots: [], scheduleDLineAmounts: {}, sources: [] }
  for (const record of docs.flatMap((doc) => recordsFromTaxDocument(doc, accountId))) {
    addRecordToReport(report, record)
  }
  return report
}

export function buildCapitalGainsReportFrom1099ExportDocs(docs: Doc1099ExportEntry[]): CapitalGainsReport {
  const report: CapitalGainsReport = { form8949Lots: [], scheduleDLineAmounts: {}, sources: [] }
  for (const record of docs.flatMap(recordsFromExportDoc)) {
    addRecordToReport(report, record)
  }
  return report
}

export function isBroker1099EntryLink(link: Pick<TaxDocumentAccountLink, 'form_type'> | undefined): boolean {
  return Boolean(link && isBroker1099EntryType(link.form_type))
}
