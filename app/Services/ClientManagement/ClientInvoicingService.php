<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use App\Services\ClientManagement\DataTransferObjects\ClosingBalance;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use App\Services\ClientManagement\DataTransferObjects\OpeningBalance;

/**
 * Service for generating client invoices with rollover hour logic.
 *
 * Invoice Structure (for month M):
 * 1. Prior-month time entries included in retainer (dated last day of M-1, $0)
 * 2. Additional work beyond retainer fee (dated last day of M-1, charged at hourly rate)
 * 3. Billable work from prior month with no retainer (dated last day of M-1, charged at hourly rate)
 * 4. Monthly retainer fee for month M (dated first day of M)
 * 5. Reimbursable expenses (dated per expense date)
 *
 * Rules:
 * - Invoice date is always the date the invoice is generated
 * - Retainer fee line item is always dated as the first day of month M
 * - Prior-month work is dated as the last day of month M-1
 * - Hourly rate is determined by the active agreement for month M
 * - Time entry subitems display their original dates
 */
class ClientInvoicingService
{
    protected RolloverCalculator $rolloverCalculator;

    public function __construct(?RolloverCalculator $rolloverCalculator = null)
    {
        $this->rolloverCalculator = $rolloverCalculator ?? new RolloverCalculator;
    }

    /**
     * Generate invoices for all calendar months from agreement start to now.
     *
     * @param  ClientCompany  $company  The client company
     * @return array Summary of generated/updated/skipped invoices
     *
     * @throws \Exception If no active agreement found
     */
    public function generateAllMonthlyInvoices(ClientCompany $company): array
    {
        $agreement = $company->activeAgreement();
        if (!$agreement) {
            throw new \Exception('No active agreement found for this client company.');
        }

        $generated = [];
        $updated = [];
        $skipped = [];

        // Start from the agreement's active date
        $currentDate = Carbon::parse($agreement->active_date)->startOfMonth();
        $endDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)
            : now();

        // Generate invoices for each calendar month
        while ($currentDate->lte($endDate)) {
            $periodStart = $currentDate->copy()->startOfMonth();
            $periodEnd = $currentDate->copy()->endOfMonth();

            // Check if invoice already exists for this period
            $existingInvoice = ClientInvoice::where('client_company_id', $company->id)
                ->where('period_start', $periodStart)
                ->where('period_end', $periodEnd)
                ->first();

            if ($existingInvoice) {
                // Skip if invoice is issued, paid, or voided
                if (in_array($existingInvoice->status, ['issued', 'paid', 'void'])) {
                    $skipped[] = [
                        'period' => $periodStart->format('Y-m'),
                        'invoice_id' => $existingInvoice->client_invoice_id,
                        'status' => $existingInvoice->status,
                        'reason' => 'Invoice already exists with status: ' . $existingInvoice->status,
                    ];
                } else {
                    // Re-generate if draft
                    try {
                        $invoice = $this->generateInvoice($company, $periodStart, $periodEnd, $agreement);
                        $updated[] = [
                            'period' => $periodStart->format('Y-m'),
                            'invoice_id' => $invoice->client_invoice_id,
                            'invoice_number' => $invoice->invoice_number,
                        ];
                    } catch (\Exception $e) {
                        $skipped[] = [
                            'period' => $periodStart->format('Y-m'),
                            'error' => $e->getMessage(),
                        ];
                    }
                }
            } else {
                // Generate new invoice
                try {
                    $invoice = $this->generateInvoice($company, $periodStart, $periodEnd, $agreement);
                    $generated[] = [
                        'period' => $periodStart->format('Y-m'),
                        'invoice_id' => $invoice->client_invoice_id,
                        'invoice_number' => $invoice->invoice_number,
                    ];
                } catch (\Exception $e) {
                    $skipped[] = [
                        'period' => $periodStart->format('Y-m'),
                        'error' => $e->getMessage(),
                    ];
                }
            }

            // Move to next month
            $currentDate->addMonth();
        }

        return [
            'generated' => $generated,
            'updated' => $updated,
            'skipped' => $skipped,
            'summary' => [
                'generated_count' => count($generated),
                'updated_count' => count($updated),
                'skipped_count' => count($skipped),
            ],
        ];
    }

    /**
     * Generate an invoice for a specific billing period.
     *
     * @param  ClientCompany  $company  The client company
     * @param  Carbon  $periodStart  Start of billing period (first day of month M)
     * @param  Carbon  $periodEnd  End of billing period (last day of month M)
     * @param  ClientAgreement|null  $agreement  The agreement to use (defaults to active agreement)
     * @return ClientInvoice The generated invoice
     *
     * @throws \Exception If no active agreement or validation fails
     */
    public function generateInvoice(
        ClientCompany $company,
        Carbon $periodStart,
        Carbon $periodEnd,
        ?ClientAgreement $agreement = null
    ): ClientInvoice {
        // Get the active agreement if not provided
        if (!$agreement) {
            $agreement = $company->activeAgreement();
            if (!$agreement) {
                throw new \Exception('No active agreement found for this client company.');
            }
        }

        // Check for an existing invoice for this exact period
        $invoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->where('period_start', $periodStart)
            ->where('period_end', $periodEnd)
            ->whereNotIn('status', ['void'])
            ->first();

        // If invoice exists and is already issued, it cannot be changed.
        if ($invoice && $invoice->isIssued()) {
            throw new \Exception("An issued invoice (#{$invoice->invoice_number}) already exists for this period and cannot be modified.");
        }

        // Check for overlapping periods with other invoices for the same company
        $overlappingInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->whereNotIn('status', ['void'])
            ->where(function ($query) use ($periodStart, $periodEnd) {
                $query->where('period_start', '<', $periodEnd)
                    ->where('period_end', '>', $periodStart);
            })
            ->when($invoice, function ($query) use ($invoice) {
                $query->where('client_invoice_id', '!=', $invoice->client_invoice_id);
            })
            ->first();

        if ($overlappingInvoice) {
            throw new \Exception(
                "An invoice (#{$overlappingInvoice->invoice_number}) already exists for an overlapping period " .
                "({$overlappingInvoice->period_start->format('M d, Y')} - {$overlappingInvoice->period_end->format('M d, Y')}). " .
                'Please choose a different date range or void the existing invoice first.'
            );
        }

        return DB::transaction(function () use ($company, $agreement, $periodStart, $periodEnd, $invoice) {
            // Get all months from agreement start OR earliest time entry to current period end
            $agreementStart = Carbon::parse($agreement->active_date)->startOfMonth();

            $earliestEntryDate = ClientTimeEntry::where('client_company_id', $company->id)
                ->where('is_billable', true)
                ->min('date_worked');

            $calculationStart = $earliestEntryDate
                ? min($agreementStart, Carbon::parse($earliestEntryDate)->startOfMonth())
                : $agreementStart;

            $calculationEnd = $periodEnd->copy()->startOfMonth();

            // Collect all billable minutes by month
            $allEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->where('is_billable', true)
                ->where('date_worked', '<=', $periodEnd)
                ->get()
                ->groupBy(fn($e) => Carbon::parse($e->date_worked)->format('Y-m'));

            $months = [];
            $currentCalculationDate = $calculationStart->copy();
            while ($currentCalculationDate->lte($calculationEnd)) {
                $monthKey = $currentCalculationDate->format('Y-m');
                $monthEntries = $allEntries->get($monthKey, collect());
                $minutesWorked = $monthEntries->sum('minutes_worked');

                $isPreAgreement = $monthKey < $agreementStart->format('Y-m');



                $months[] = [
                    'year_month' => $monthKey,
                    'retainer_hours' => $isPreAgreement ? 0.0 : (float) $agreement->monthly_retainer_hours,
                    'hours_worked' => $minutesWorked / 60,
                ];
                $currentCalculationDate->addMonth();
            }



            // Calculate balances chronologically
            $calculator = new RolloverCalculator();
            /** @var MonthSummary[] $allBalances */
            $allBalances = $calculator->calculateMultipleMonths($months, (int) $agreement->rollover_months);

            // Get unbilled time entries from the prior month (M-1)
            $priorMonthEnd = $periodStart->copy()->subDay(); // Last day of M-1
            $priorMonthStart = $priorMonthEnd->copy()->startOfMonth(); // First day of M-1

            $priorMonthEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->whereBetween('date_worked', [$priorMonthStart, $priorMonthEnd])
                ->orderBy('date_worked')
                ->get();
            $priorMonthKey = $priorMonthStart->format('Y-m');

            // Find balance for the current invoice month (M)
            $currentMonthKey = $periodEnd->format('Y-m');
            /** @var MonthSummary|null $currentMonthBalance */
            $currentMonthBalance = null;
            foreach ($allBalances as $balance) {
                if ($balance->yearMonth === $currentMonthKey) {
                    $currentMonthBalance = $balance;
                    break;
                }
            }

            // Fallback to end of balances if not found (shouldn't happen with our loop unless empty)
            $currentMonthBalance = $currentMonthBalance ?: (empty($allBalances) ? null : end($allBalances));

            // If still null (e.g. no agreement/calculation history), start fresh
            if (!$currentMonthBalance) {
                $retainer = (float) $agreement->monthly_retainer_hours;
                $currentMonthBalance = new MonthSummary(
                    opening: new OpeningBalance(
                        retainerHours: $retainer,
                        rolloverHours: 0,
                        expiredHours: 0,
                        totalAvailable: $retainer,
                        negativeOffset: 0,
                        invoicedNegativeBalance: 0,
                        effectiveRetainerHours: $retainer,
                        remainingNegativeBalance: 0
                    ),
                    closing: new ClosingBalance(
                        hoursUsedFromRetainer: 0,
                        hoursUsedFromRollover: 0,
                        unusedHours: $retainer,
                        excessHours: 0,
                        negativeBalance: 0,
                        remainingRollover: 0
                    ),
                    hoursWorked: 0,
                    yearMonth: $currentMonthKey,
                    retainerHours: $retainer
                );
            }

            // Prepare invoice data
            $invoiceData = [
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'retainer_hours_included' => (float) $agreement->monthly_retainer_hours,
                'hours_worked' => $priorMonthEntries->sum('minutes_worked') / 60,
                'rollover_hours_used' => $currentMonthBalance->closing->hoursUsedFromRollover,
                'unused_hours_balance' => $currentMonthBalance->closing->unusedHours,
                'negative_hours_balance' => $currentMonthBalance->closing->negativeBalance,
                'hours_billed_at_rate' => 0, // We'll set this if we decide to bill overage
                'status' => 'draft',
            ];

            if ($invoice) {
                // Update existing draft invoice
                $invoice->update($invoiceData);

                // Delete system-generated line items
                $systemGeneratedTypes = ['retainer', 'additional_hours', 'credit', 'prior_month_retainer', 'prior_month_billable'];
                $systemLines = $invoice->lineItems()->whereIn('line_type', $systemGeneratedTypes)->get();
                foreach ($systemLines as $line) {
                    $line->timeEntries()->update(['client_invoice_line_id' => null]);
                }
                $invoice->lineItems()->whereIn('line_type', $systemGeneratedTypes)->delete();

                $expenseLines = $invoice->lineItems()->where('line_type', 'expense')->get();
                foreach ($expenseLines as $line) {
                    $line->expenses()->update(['client_invoice_line_id' => null]);
                }
                $invoice->lineItems()->where('line_type', 'expense')->delete();
            } else {
                $invoiceData['invoice_number'] = $this->generateInvoiceNumber($company, $agreement);
                $invoiceData['invoice_total'] = 0;
                $invoice = ClientInvoice::create($invoiceData);
            }

            $sortOrder = 1;

            // --- PRIOR MONTH WORK & BALANCE ADJUSTMENTS ---
            // Process unbilled work from M-1 and/or address pre-existing debt from previous invoices.

            // 1. Determine M-1 Limit
            /** @var MonthSummary|null $priorMonthBalance */
            $priorMonthBalance = null;
            foreach ($allBalances as $balance) {
                if ($balance->yearMonth === $priorMonthEnd->format('Y-m')) {
                    $priorMonthBalance = $balance;
                    break;
                }
            }
            $history = ClientInvoice::where('client_agreement_id', $agreement->id)
                ->where('period_end', '<', $periodStart)
                ->whereNotIn('status', ['void'])
                ->orderBy('period_start', 'asc')
                ->get();
            $m1_invoice = $history->first(fn($inv) => $inv->period_start->format('Y-m') === $priorMonthKey);
            $alreadyBilledM1 = $m1_invoice ? $m1_invoice->hours_worked : 0;

            // m1_limit: Portion of the NOW-CALCULATED M-1 pool usage that belongs to the NEW entries.
            $m1_limit = 0;
            if ($priorMonthBalance && $priorMonthBalance->closing) {
                $totalUsedM1 = $priorMonthBalance->closing->hoursUsedFromRetainer + $priorMonthBalance->closing->hoursUsedFromRollover;
                $poolInvoicedM1 = min($alreadyBilledM1, $priorMonthBalance->opening->totalAvailable);
                $m1_limit = max(0, $totalUsedM1 - $poolInvoicedM1);
            }

            // 2. Determine M Limit (Negative Offset)
            // Capped at (retainer - 1) to preserve availability buffer.
            $m_limit = min(
                $currentMonthBalance->opening->negativeOffset ?? 0,
                max(0.0, (float) $agreement->monthly_retainer_hours - 1.0)
            );

            // --- STAGE 1 & 2: Process Unbilled Prior Month Entries ---
            if ($priorMonthEntries->count() > 0) {

                // --- STAGE 1: Covered by M-1 ---
                $entriesToProcess = $priorMonthEntries;
                $coveredByM1 = $this->selectEntriesUpToHours($entriesToProcess, $m1_limit);

                if ($coveredByM1->count() > 0) {
                    $hours = $coveredByM1->sum('minutes_worked') / 60;
                    $line = ClientInvoiceLine::create([
                        'client_invoice_id' => $invoice->client_invoice_id,
                        'client_agreement_id' => $agreement->id,
                        'description' => "Work items from prior month applied to retainer ({$this->formatHoursForQuantity($hours)} applied to {$priorMonthEnd->format('F Y')} retainer)",
                        'quantity' => $this->formatHoursForQuantity($hours),
                        'unit_price' => 0,
                        'line_total' => 0,
                        'line_type' => 'prior_month_retainer',
                        'hours' => $hours,
                        'line_date' => $priorMonthEnd,
                        'sort_order' => $sortOrder++,
                    ]);
                    $this->linkTimeEntriesToLine($coveredByM1, $line);
                }

                // Refresh remaining unlinked entries for Stage 2
                $remainingEntries = ClientTimeEntry::where('client_company_id', $company->id)
                    ->whereNull('client_invoice_line_id')
                    ->where('is_billable', true)
                    ->whereBetween('date_worked', [$priorMonthStart, $priorMonthEnd])
                    ->orderBy('date_worked')
                    ->get();

                // --- STAGE 2: Covered by M ---
                if ($remainingEntries->count() > 0 && $m_limit > 0) {
                    $coveredByM = $this->selectEntriesUpToHours($remainingEntries, $m_limit);

                    if ($coveredByM->count() > 0) {
                        $hours = $coveredByM->sum('minutes_worked') / 60;
                        $line = ClientInvoiceLine::create([
                            'client_invoice_id' => $invoice->client_invoice_id,
                            'client_agreement_id' => $agreement->id,
                            'description' => "Work items from prior month applied to retainer ({$this->formatHoursForQuantity($hours)} applied to {$periodStart->format('F Y')} retainer)",
                            'quantity' => $this->formatHoursForQuantity($hours),
                            'unit_price' => 0,
                            'line_total' => 0,
                            'line_type' => 'prior_month_retainer',
                            'hours' => $hours,
                            'line_date' => $priorMonthEnd,
                            'sort_order' => $sortOrder++,
                        ]);
                        $this->linkTimeEntriesToLine($coveredByM, $line);
                    }
                }

            }

            // --- STAGE 3: Catch-up Billing & Carry Forward ---
            // Refresh remaining unlinked entries for Catch-up and/or Stage 3
            // (We do this regardless of entry count so catch-up can trigger on pre-existing debt)
            $finalRemaining = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->whereBetween('date_worked', [$priorMonthStart, $priorMonthEnd])
                ->orderBy('date_worked')
                ->get();

            // --- Minimum Availability Rule (Catch-up Billing) ---
            $opening = $currentMonthBalance->opening;
            $available = (float) $opening->totalAvailable - (float) $opening->remainingNegativeBalance;

            if ($available < 1) {
                $targetAvailable = 1.0;
                $catchUpHours = $targetAvailable - $available;

                $catchUpLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Catch-up hours to restore minimum availability ({$this->formatHoursForQuantity($catchUpHours)} billed to ensure 1h available)",
                    'quantity' => $this->formatHoursForQuantity($catchUpHours),
                    'unit_price' => $agreement->hourly_rate,
                    'line_total' => $catchUpHours * $agreement->hourly_rate,
                    'line_type' => 'additional_hours',
                    'hours' => $catchUpHours,
                    'line_date' => $periodStart,
                    'sort_order' => $sortOrder++,
                ]);

                // Link entries to catch-up line (if any remain unbilled)
                $toLink = $this->selectEntriesUpToHours($finalRemaining, $catchUpHours);
                if ($toLink->count() > 0) {
                    $this->linkTimeEntriesToLine($toLink, $catchUpLine);
                }

                // Refresh finalRemaining for carried forward line
                $finalRemaining = ClientTimeEntry::where('client_company_id', $company->id)
                    ->whereNull('client_invoice_line_id')
                    ->where('is_billable', true)
                    ->whereBetween('date_worked', [$priorMonthStart, $priorMonthEnd])
                    ->orderBy('date_worked')
                    ->get();

                // Update balances
                $oldRemainingNegative = (float) $opening->remainingNegativeBalance;
                $newNegativeBalance = max(0, $oldRemainingNegative - $catchUpHours);
                $invoice->update([
                    'negative_hours_balance' => $newNegativeBalance,
                    'unused_hours_balance' => 1.0,
                    'hours_billed_at_rate' => $catchUpHours,
                ]);

                if ($currentMonthBalance->closing) {
                    $currentMonthBalance->closing->negativeBalance = max(0, $currentMonthBalance->closing->negativeBalance - $catchUpHours);
                }
            }

            // Carry forward any still-unlinked prior month work
            if ($finalRemaining->count() > 0) {
                $hours = $finalRemaining->sum('minutes_worked') / 60;
                $nextMonthName = $periodStart->copy()->addMonth()->format('F Y');
                $line = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Work items from prior month exceeding retainer ({$this->formatHoursForQuantity($hours)} applied to {$nextMonthName} retainer)",
                    'quantity' => $this->formatHoursForQuantity($hours),
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'prior_month_retainer',
                    'hours' => $hours,
                    'line_date' => $priorMonthEnd,
                    'sort_order' => $sortOrder++,
                ]);
                $this->linkTimeEntriesToLine($finalRemaining, $line);
            }

            // Line 4: Monthly retainer fee for month M
            ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => "Monthly Retainer ({$agreement->monthly_retainer_hours} hours) - " . $periodStart->format('M j, Y'),
                'quantity' => '1',
                'unit_price' => $agreement->monthly_retainer_fee,
                'line_total' => $agreement->monthly_retainer_fee,
                'line_type' => 'retainer',
                'hours' => (float) $agreement->monthly_retainer_hours,
                'line_date' => $periodStart,
                'sort_order' => $sortOrder++,
            ]);


            // Informational rollover/negative balance line
            if ($currentMonthBalance && ($currentMonthBalance->closing->hoursUsedFromRollover > 0 || $currentMonthBalance->closing->negativeBalance > 0)) {
                $desc = 'Balance update: ';
                if ($currentMonthBalance->closing->hoursUsedFromRollover > 0) {
                    $desc .= "Used {$currentMonthBalance->closing->hoursUsedFromRollover}h rollover. ";
                }
                if ($currentMonthBalance->closing->negativeBalance > 0) {
                    $desc .= "Negative balance of {$currentMonthBalance->closing->negativeBalance}h carried forward to {$periodStart->copy()->addMonth()->format('F Y')}. ";
                }

                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => trim($desc),
                    'quantity' => '0',
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'credit',
                    'hours' => 0,
                    'line_date' => $periodStart,
                    'sort_order' => $sortOrder++,
                ]);
            }

            $this->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);
            $invoice->recalculateTotal();
            $this->updateInvoicePeriodFromLineItems($invoice);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Add reimbursable expenses to the invoice.
     */
    protected function addReimbursableExpenses(
        ClientCompany $company,
        ClientInvoice $invoice,
        Carbon $invoiceDate,
        int &$sortOrder
    ): void {
        // Get all un-invoiced reimbursable expenses up to and including the invoice date
        $expenses = ClientExpense::where('client_company_id', $company->id)
            ->where('is_reimbursable', true)
            ->whereNull('client_invoice_line_id')
            ->where('expense_date', '<=', $invoiceDate)
            ->orderBy('expense_date')
            ->get();

        foreach ($expenses as $expense) {
            $line = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $invoice->client_agreement_id,
                'description' => $expense->description,
                'quantity' => 1,
                'unit_price' => $expense->amount,
                'line_total' => $expense->amount,
                'line_type' => 'expense',
                'hours' => null,
                'line_date' => $expense->expense_date,
                'sort_order' => $sortOrder++,
            ]);

            // Link expense to invoice line
            $expense->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Select time entries up to the specified hours limit.
     */
    protected function selectEntriesUpToHours($entries, float $hoursLimit): \Illuminate\Support\Collection
    {
        $minutesLimit = (int) round($hoursLimit * 60);
        $minutesSelected = 0;
        $selectedEntries = collect();

        foreach ($entries as $entry) {
            if ($entry->client_invoice_line_id !== null) {
                continue;
            }

            if ($minutesSelected >= $minutesLimit) {
                break;
            }

            $remainingNeeded = $minutesLimit - $minutesSelected;

            if ($entry->minutes_worked <= $remainingNeeded) {
                $selectedEntries->push($entry);
                $minutesSelected += $entry->minutes_worked;
            } else {
                // Partial entry - split it
                $overageMinutes = $entry->minutes_worked - $remainingNeeded;

                // Create a new entry for the overage
                $rolledOverEntry = $entry->replicate();
                $rolledOverEntry->minutes_worked = $overageMinutes;
                $rolledOverEntry->client_invoice_line_id = null;
                $rolledOverEntry->save();

                // Update original entry to the billed portion
                $entry->minutes_worked = $remainingNeeded;
                $entry->save();

                $selectedEntries->push($entry);
                $minutesSelected += $remainingNeeded;
            }
        }

        return $selectedEntries;
    }

    /**
     * Link all provided time entries to an invoice line.
     */
    protected function linkAllEntriesToLine($entries, ClientInvoiceLine $line): void
    {
        foreach ($entries as $entry) {
            if ($entry->client_invoice_line_id === null) {
                $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
            }
        }
    }

    /**
     * Link time entries to an invoice line.
     */
    protected function linkTimeEntriesToLine($entries, ClientInvoiceLine $line): void
    {
        foreach ($entries as $entry) {
            $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Update invoice period_start and period_end based on actual line item dates.
     * Expands the period to include the full range from earliest to latest line_date,
     * but never contracts it smaller than the original billing period.
     */
    protected function updateInvoicePeriodFromLineItems(ClientInvoice $invoice): void
    {
        $lineItems = $invoice->lineItems()->whereNotNull('line_date')->get();

        if ($lineItems->isEmpty()) {
            return;
        }

        $earliestLineDate = $lineItems->min('line_date');
        $latestLineDate = $lineItems->max('line_date');

        // Expand period to include line item dates, but don't contract
        $newPeriodStart = min($invoice->period_start, $earliestLineDate);
        $newPeriodEnd = max($invoice->period_end, $latestLineDate);

        $invoice->update([
            'period_start' => $newPeriodStart,
            'period_end' => $newPeriodEnd,
        ]);
    }

    /**
     * Format hours as h:mm string for invoice line quantity display.
     * 
     * @param float $hours Decimal hours (e.g., 1.5)
     * @return string Formatted as "h:mm" (e.g., "1:30")
     */
    protected function formatHoursForQuantity(float $hours): string
    {
        $totalMinutes = (int) round($hours * 60);
        $h = intdiv($totalMinutes, 60);
        $m = $totalMinutes % 60;

        return sprintf('%d:%02d', $h, $m);
    }

    /**
     * Calculate rollover hours available from previous invoices within the rollover window.
     */
    protected function calculateRolloverHours(
        ClientAgreement $agreement,
        Carbon $periodStart,
        ?ClientInvoice $previousInvoice
    ): float {
        if ((int) $agreement->rollover_months === 0) {
            return 0;
        }

        // Find invoices within the rollover window
        $rolloverWindowStart = $periodStart->copy()->subMonths((int) $agreement->rollover_months);

        // Sum up unused hours from invoices in the rollover window
        $rolloverHours = ClientInvoice::where('client_agreement_id', $agreement->id)
            ->whereNotIn('status', ['void'])
            ->where('period_start', '>=', $rolloverWindowStart)
            ->where('period_end', '<', $periodStart)
            ->sum('unused_hours_balance');

        return (float) $rolloverHours;
    }

    /**
     * Generate a unique invoice number.
     */
    protected function generateInvoiceNumber(ClientCompany $company, ClientAgreement $agreement): string
    {
        $rawPrefix = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $company->company_name), 0, 4));
        $prefix = $rawPrefix ? "$rawPrefix-" : '';
        $yearMonth = now()->format('Ym');

        $lastInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('invoice_number', 'like', "{$rawPrefix}%{$yearMonth}-%")
            ->orderBy('invoice_number', 'desc')
            ->first();

        if ($lastInvoice) {
            $lastSeq = (int) substr($lastInvoice->invoice_number, -3);
            $seq = $lastSeq + 1;
        } else {
            $seq = 1;
        }

        return sprintf('%s%s-%03d', $prefix, $yearMonth, $seq);
    }

    /**
     * Get invoicing history for a client company.
     */
    public function getInvoiceHistory(ClientCompany $company): array
    {
        $invoices = ClientInvoice::where('client_company_id', $company->id)
            ->with(['agreement', 'lineItems'])
            ->orderBy('period_start', 'desc')
            ->get();

        return $invoices->map(function ($invoice) {
            return [
                'id' => $invoice->client_invoice_id,
                'invoice_number' => $invoice->invoice_number,
                'period_start' => $invoice->period_start->toDateString(),
                'period_end' => $invoice->period_end->toDateString(),
                'invoice_total' => $invoice->invoice_total,
                'status' => $invoice->status,
                'issue_date' => $invoice->issue_date?->toDateString(),
                'paid_date' => $invoice->paid_date?->toDateString(),
                'hours_worked' => $invoice->hours_worked,
                'retainer_hours_included' => $invoice->retainer_hours_included,
                'unused_hours_balance' => $invoice->unused_hours_balance,
                'hours_billed_at_rate' => $invoice->hours_billed_at_rate,
            ];
        })->toArray();
    }
}