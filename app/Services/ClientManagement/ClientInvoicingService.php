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
use App\Services\ClientManagement\DataTransferObjects\TimeEntryFragment;
use App\Services\ClientManagement\DataTransferObjects\AllocationPlan;

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
            // Invoice period covers the PRIOR month's work (M-1)
            // The invoice date (retainer renewal) is the first of month M
            $priorMonth = $currentDate->copy()->subMonth();
            $periodStart = $priorMonth->copy()->startOfMonth();
            $periodEnd = $priorMonth->copy()->endOfMonth();

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
     * Generate an invoice for a specific work period.
     *
     * The invoice covers work done during periodStart to periodEnd (the "work period").
     * The retainer fee applied is for the month AFTER the work period (the "retainer month").
     *
     * Example: periodStart=Jan 1, periodEnd=Jan 31 creates an invoice for January work
     * with the February retainer applied. Invoice date is Feb 1.
     *
     * @param  ClientCompany  $company  The client company
     * @param  Carbon  $periodStart  Start of work period (first day of month M-1)
     * @param  Carbon  $periodEnd  End of work period (last day of month M-1)
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

            $retainerMonthStart = $periodEnd->copy()->addDay()->startOfMonth(); // First of M
            $calculationEnd = $retainerMonthStart->copy();

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

            Log::debug('Rollover Calculation Results', [
                'months' => $months,
                'results' => collect($allBalances)->map(fn($b) => [
                    'm' => $b->yearMonth,
                    'used_rollover' => $b->closing->hoursUsedFromRollover,
                    'unused' => $b->closing->unusedHours,
                    'opening_avail' => $b->opening->totalAvailable,
                    'opening_offset' => $b->opening->negativeOffset
                ])
            ]);

            // With the new period semantics, periodStart/periodEnd IS the work period (M-1)
            // The retainer month (M) is the month after periodEnd
            $workPeriodStart = $periodStart;
            $workPeriodEnd = $periodEnd;

            $priorMonthEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->whereBetween('date_worked', [$workPeriodStart, $workPeriodEnd])
                ->orderBy('date_worked')
                ->get();
            $priorMonthKey = $workPeriodStart->format('Y-m');

            // There are no "current month entries" to include since we're billing for work period only
            $currentMonthEntries = collect();

            // Find balance for the current invoice retainer month (M) - the month after the work period
            $currentMonthKey = $retainerMonthStart->format('Y-m');
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

            // Also find the balance for the work month (M-1)
            $workMonthBalance = null;
            foreach ($allBalances as $balance) {
                if ($balance->yearMonth === $priorMonthKey) {
                    $workMonthBalance = $balance;
                    break;
                }
            }
            $workMonthBalance = $workMonthBalance ?: $currentMonthBalance;

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

            // Calculate cumulative balance including catch-up billing
            $cumulativeSnapshot = $this->calculateCumulativeBalanceSnapshot($agreement, $periodEnd, $allBalances);

            // Prepare invoice data
            $invoiceData = [
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'retainer_hours_included' => (float) $agreement->monthly_retainer_hours,
                'hours_worked' => $priorMonthEntries->sum('minutes_worked') / 60,
                'rollover_hours_used' => $workMonthBalance ? $workMonthBalance->closing->hoursUsedFromRollover : 0,
                'unused_hours_balance' => $cumulativeSnapshot['unused'],
                'negative_hours_balance' => $cumulativeSnapshot['negative'],
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
                $invoiceData['invoice_number'] = $this->generateInvoiceNumber($company, $agreement, $periodEnd);
                $invoiceData['invoice_total'] = 0;
                $invoice = ClientInvoice::create($invoiceData);
            }

            $sortOrder = 1;

            // Recombine any unlinked fragments before generating invoice
            $allocationService = new AllocationService();
            $allocationService->recombineUnlinkedFragments($company->id);

            // Re-fetch unbilled work period entries after recombination
            $priorMonthEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->whereBetween('date_worked', [$workPeriodStart, $workPeriodEnd])
                ->orderBy('date_worked')
                ->orderBy('id')
                ->get();

            // Calculate prior month capacity from balance
            /** @var MonthSummary|null $priorMonthBalance */
            $priorMonthBalance = null;
            foreach ($allBalances as $balance) {
                if ($balance->yearMonth === $workPeriodEnd->format('Y-m')) {
                    $priorMonthBalance = $balance;
                    break;
                }
            }

            // Calculate how much of M-1 pool is available for NEW entries
            $history = ClientInvoice::where('client_agreement_id', $agreement->id)
                ->where('period_end', '<', $periodStart)
                ->whereNotIn('status', ['void'])
                ->orderBy('period_start', 'asc')
                ->get();
            $m1_invoice = $history->first(fn($inv) => $inv->period_start->format('Y-m') === $priorMonthKey);
            $alreadyBilledM1 = $m1_invoice ? $m1_invoice->hours_worked : 0;

            // Calculate capacities:
            // 1. Prior Month Capacity: What Jan has itself (including Jan's rollover from Dec)
            // 2. Current Month Capacity: What Feb has available to cover Jan's overage (M retainer)
            $priorMonthCapacity = $priorMonthBalance ? $priorMonthBalance->opening->totalAvailable : 0;
            $currentMonthCapacity = (float) $agreement->monthly_retainer_hours;
            $catchUpThreshold = (float) ($agreement->catch_up_threshold_hours ?? 1.0);

            // Use TimeEntrySplitter to allocate time entries
            $splitter = new TimeEntrySplitter();
            $plan = $splitter->allocateTimeEntries(
                $priorMonthEntries,
                $priorMonthCapacity,
                $currentMonthCapacity,
                $catchUpThreshold
            );

            // Create invoice lines from allocation plan

            // Pre-process all fragments to split entries as needed
            $fragmentsToLines = [];  // Maps line_id => [fragments]

            // Prior month retainer fragments
            $priorMonthLine = null;
            if (count($plan->priorMonthRetainerFragments) > 0) {
                $hours = $plan->totalPriorMonthRetainerHours;
                $priorMonthLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Work items applied to retainer ({$this->formatHoursForQuantity($hours)} applied to {$workPeriodEnd->format('F Y')} pool)",
                    'quantity' => $this->formatHoursForQuantity($hours),
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'prior_month_retainer',
                    'hours' => $hours,
                    'line_date' => $workPeriodEnd,
                    'sort_order' => $sortOrder++,
                ]);
                $fragmentsToLines[$priorMonthLine->client_invoice_line_id] = $plan->priorMonthRetainerFragments;
            }

            // Current month retainer fragments
            $currentMonthLine = null;
            if (count($plan->currentMonthRetainerFragments) > 0) {
                $hours = $plan->totalCurrentMonthRetainerHours;
                $currentMonthLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Work items applied to retainer ({$this->formatHoursForQuantity($hours)} applied to {$retainerMonthStart->format('F Y')} pool)",
                    'quantity' => $this->formatHoursForQuantity($hours),
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => 'prior_month_retainer',
                    'hours' => $hours,
                    'line_date' => $workPeriodEnd,
                    'sort_order' => $sortOrder++,
                ]);
                $fragmentsToLines[$currentMonthLine->client_invoice_line_id] = $plan->currentMonthRetainerFragments;
            }

            // Catch-up threshold + billable catch-up fragments combined into one line
            // Also add buffer if remaining capacity after allocation is below threshold.
            // Capacity remaining is the sum of unused M-1 pool and unused M debt-coverage pool.
            $remainingCapacityAfterAllocation = ($priorMonthCapacity - $plan->totalPriorMonthRetainerHours) +
                ($currentMonthCapacity - $plan->totalCurrentMonthRetainerHours);
            $bufferNeeded = max(0, $catchUpThreshold - $remainingCapacityAfterAllocation);
            $totalCatchupHours = $plan->totalCatchUpHours + $plan->totalBillableCatchupHours + $bufferNeeded;

            $catchUpLine = null;
            if ($totalCatchupHours > 0) {
                $catchUpLine = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Catch-up hours for prior month overage and minimum availability",
                    'quantity' => $this->formatHoursForQuantity($totalCatchupHours),
                    'unit_price' => $agreement->hourly_rate,
                    'line_total' => $totalCatchupHours * $agreement->hourly_rate,
                    'line_type' => 'additional_hours',
                    'hours' => $totalCatchupHours,
                    'line_date' => $periodStart,
                    'sort_order' => $sortOrder++,
                ]);

                $allCatchupFragments = array_merge(
                    $plan->catchUpFragments,
                    $plan->billableCatchupFragments
                );
                $fragmentsToLines[$catchUpLine->client_invoice_line_id] = $allCatchupFragments;

                // Update invoice with billed hours and remaining capacity
                // The catch-up billing pays for the overage and restores the threshold
                $invoice->update([
                    'hours_billed_at_rate' => $totalCatchupHours,
                ]);

                // Re-calculate the balance snapshot now that we have hours_billed_at_rate set
                $cumulativeSnapshot = $this->calculateCumulativeBalanceSnapshot($agreement, $periodEnd, $allBalances);
                $invoice->update([
                    'negative_hours_balance' => $cumulativeSnapshot['negative'],
                    'unused_hours_balance' => $cumulativeSnapshot['unused'],
                ]);
            }

            // Now process all fragments and link them to lines, handling splits correctly
            $this->linkAllFragmentsToLines($fragmentsToLines, $splitter);

            // Monthly retainer fee for month M (the month after the work period)
            ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => "Monthly Retainer ({$agreement->monthly_retainer_hours} hours) - " . $retainerMonthStart->format('M j, Y'),
                'quantity' => '1',
                'unit_price' => $agreement->monthly_retainer_fee,
                'line_total' => $agreement->monthly_retainer_fee,
                'line_type' => 'retainer',
                'hours' => (float) $agreement->monthly_retainer_hours,
                'line_date' => $retainerMonthStart,
                'sort_order' => $sortOrder++,
            ]);

            $this->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);
            $invoice->recalculateTotal();
            $this->updateInvoicePeriodFromLineItems($invoice);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Calculate cumulative balance snapshot for the invoice.
     */
    protected function calculateCumulativeBalanceSnapshot(ClientAgreement $agreement, Carbon $periodEnd, array $allBalances): array
    {
        // The unused hours balance should reflect the state AFTER processing the work period
        // So we look at the work period month, not the retainer month
        $workMonthKey = $periodEnd->format('Y-m');

        // Find calculator summary for work month
        $summary = null;
        foreach ($allBalances as $b) {
            if ($b->yearMonth === $workMonthKey) {
                $summary = $b;
                break;
            }
        }

        if (!$summary) {
            return ['unused' => 0, 'negative' => 0];
        }

        // Total hours billed at rate in history (excluding drafts for this exact period)
        $totalBilledOverages = ClientInvoice::where('client_agreement_id', $agreement->id)
            ->whereNotIn('status', ['void'])
            ->where('period_end', '<=', $periodEnd)
            ->sum('hours_billed_at_rate');

        // We report based on the OPENING balance of the target month (Month M),
        // which includes the effect of M-1's work and M's retainer.
        $netNegative = $summary->opening->remainingNegativeBalance;
        $netUnused = $summary->opening->totalAvailable;


        return [
            'unused' => round($netUnused, 4),
            'negative' => round($netNegative, 4),
        ];
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
     * Link all time entry fragments to their respective invoice lines, handling splits correctly.
     * 
     * @param array $fragmentsToLines Map of line_id => TimeEntryFragment[]
     * @param TimeEntrySplitter $splitter
     */
    protected function linkAllFragmentsToLines(array $fragmentsToLines, TimeEntrySplitter $splitter): void
    {
        // Group all fragments by their original time entry ID across all lines
        $entrySplitPlan = [];  // entry_id => [['line_id' => X, 'minutes' => Y], ...]

        foreach ($fragmentsToLines as $lineId => $fragments) {
            foreach ($fragments as $fragment) {
                $entryId = $fragment->originalTimeEntryId;
                if (!isset($entrySplitPlan[$entryId])) {
                    $entrySplitPlan[$entryId] = [];
                }
                $entrySplitPlan[$entryId][] = [
                    'line_id' => $lineId,
                    'minutes' => $fragment->minutes,
                ];
            }
        }

        // Process each entry that needs to be split/linked
        foreach ($entrySplitPlan as $entryId => $splits) {
            $entry = ClientTimeEntry::find($entryId);
            if (!$entry) {
                continue;
            }

            // If only one split and it uses the entire entry, link directly
            if (count($splits) == 1 && $splits[0]['minutes'] >= $entry->minutes_worked) {
                $entry->update(['client_invoice_line_id' => $splits[0]['line_id']]);
                continue;
            }

            // Need to split the entry into multiple pieces
            $remainingEntry = $entry;
            $totalMinutes = $entry->minutes_worked;
            $processedMinutes = 0;

            foreach ($splits as $i => $split) {
                $minutesForThisSplit = min($split['minutes'], $totalMinutes - $processedMinutes);

                if ($minutesForThisSplit <= 0) {
                    break;
                }

                $isLastSplit = ($i == count($splits) - 1) || ($processedMinutes + $minutesForThisSplit >= $totalMinutes);

                if ($isLastSplit) {
                    // Last piece - just link the remaining entry
                    $remainingEntry->update(['client_invoice_line_id' => $split['line_id']]);
                } else {
                    // Split off a piece for this line
                    $splitResult = $splitter->splitEntry($remainingEntry, $minutesForThisSplit);
                    $splitResult['primary']->update(['client_invoice_line_id' => $split['line_id']]);
                    $remainingEntry = $splitResult['overflow'];  // Continue with the overflow
                }

                $processedMinutes += $minutesForThisSplit;
            }
        }
    }

    /**
     * Link time entry fragments to an invoice line, splitting entries if necessary.
     * 
     * @param TimeEntryFragment[] $fragments
     * @param ClientInvoiceLine $line
     * @param TimeEntrySplitter $splitter
     */
    protected function linkFragmentsToLine(array $fragments, ClientInvoiceLine $line, TimeEntrySplitter $splitter): void
    {
        // Group fragments by their original time entry ID
        $fragmentsByEntry = [];
        foreach ($fragments as $fragment) {
            $entryId = $fragment->originalTimeEntryId;
            if (!isset($fragmentsByEntry[$entryId])) {
                $fragmentsByEntry[$entryId] = [];
            }
            $fragmentsByEntry[$entryId][] = $fragment;
        }

        // Process each time entry
        foreach ($fragmentsByEntry as $entryId => $entryFragments) {
            $entry = ClientTimeEntry::find($entryId);
            if (!$entry) {
                continue; // Entry was deleted or not found
            }

            // Calculate total minutes needed from this entry for this line
            $totalMinutesNeeded = array_reduce(
                $entryFragments,
                fn($sum, $frag) => $sum + $frag->minutes,
                0
            );

            // If the fragment uses the entire entry, link it directly
            if ($totalMinutesNeeded >= $entry->minutes_worked) {
                $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
            } else {
                // Split the entry: keep needed portion, create overflow
                $split = $splitter->splitEntry($entry, $totalMinutesNeeded);
                // Link the primary (needed portion) to this line
                $split['primary']->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
                // Overflow remains unlinked for future allocation
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
        // Only look at line items that likely represent work or expenses
        // (prior month retainer, catchup, expenses)
        // We specifically avoid the current month retainer Fee which might be dated for the future month M
        $lineItems = $invoice->lineItems()
            ->whereNotNull('line_date')
            ->where('line_type', '!=', 'retainer')
            ->get();

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
     * Uses the YYYYMM of the period_end date to ensure invoice numbers match the billing period.
     */
    protected function generateInvoiceNumber(ClientCompany $company, ClientAgreement $agreement, Carbon $periodEnd): string
    {
        $rawPrefix = strtoupper(substr(preg_replace('/[^a-zA-Z0-9]/', '', $company->company_name), 0, 4));
        $prefix = $rawPrefix ? "$rawPrefix-" : '';
        $yearMonth = $periodEnd->format('Ym');

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