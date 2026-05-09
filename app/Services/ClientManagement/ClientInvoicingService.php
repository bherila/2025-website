<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Enums\ClientManagement\InvoiceKind;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\DataTransferObjects\BillingCycle;
use App\Services\ClientManagement\DataTransferObjects\ClosingBalance;
use App\Services\ClientManagement\DataTransferObjects\DeferredAllocationResult;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use App\Services\ClientManagement\DataTransferObjects\OpeningBalance;
use App\Services\ClientManagement\DataTransferObjects\TimeEntryFragment;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

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

    protected BillingCycleResolver $billingCycleResolver;

    protected RecurringItemBiller $recurringItemBiller;

    /**
     * Deferred entries that were not billed on the most recent
     * {@see generateInvoice()} call because they didn't fit in the
     * remaining retainer capacity. Surfaced through the controller so
     * the invoice detail UI can list them as "deferred to a future
     * invoice".
     *
     * @var list<array{id: int, hours: float, date_worked: string, name: string|null}>
     */
    protected array $deferredSkipped = [];

    public function __construct(
        ?RolloverCalculator $rolloverCalculator = null,
        ?BillingCycleResolver $billingCycleResolver = null,
        ?RecurringItemBiller $recurringItemBiller = null,
    ) {
        $this->rolloverCalculator = $rolloverCalculator ?? new RolloverCalculator;
        $this->billingCycleResolver = $billingCycleResolver ?? new BillingCycleResolver;
        $this->recurringItemBiller = $recurringItemBiller ?? new RecurringItemBiller;
    }

    /**
     * Skipped-deferred summary from the most recent generateInvoice() call.
     *
     * @return list<array{id: int, hours: float, date_worked: string, name: string|null}>
     */
    public function lastDeferredSkipped(): array
    {
        return $this->deferredSkipped;
    }

    /**
     * Generate invoices through the current cadence cycle.
     *
     * @return array{
     *     generated: list<array<string, mixed>>,
     *     updated: list<array<string, mixed>>,
     *     skipped: list<array<string, mixed>>,
     *     summary: array{
     *         generated_count: int,
     *         updated_count: int,
     *         skipped_count: int,
     *         cadence_period_invoices_created: int,
     *         interim_invoices_created: int
     *     }
     * }
     */
    public function generateAllInvoices(ClientCompany $company): array
    {
        $results = $this->emptyGenerationResults();

        foreach ($this->agreementsForInvoiceGeneration($company) as $agreement) {
            $agreementResults = $agreement->effectiveBillingCadence() === BillingCadence::Monthly
                ? $this->generateAllMonthlyInvoicesForAgreement($company, $agreement)
                : $this->generateAllCadenceInvoices($company, $agreement);

            $results = $this->mergeGenerationResults($results, $agreementResults);
        }

        return $results;
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
        // Use active agreement if available; otherwise fall back to the most recently
        // terminated agreement so we can still issue post-termination invoices.
        $agreement = $this->agreementForInvoiceGeneration($company);

        if ($agreement->effectiveBillingCadence() !== BillingCadence::Monthly) {
            throw new \Exception('generateAllMonthlyInvoices only supports monthly agreements. Use generateAllInvoices for cadence-aware generation.');
        }

        return $this->generateAllMonthlyInvoicesForAgreement($company, $agreement);
    }

    /**
     * Generate invoices for one monthly agreement segment.
     *
     * @return array{
     *     generated: list<array<string, mixed>>,
     *     updated: list<array<string, mixed>>,
     *     skipped: list<array<string, mixed>>,
     *     summary: array{
     *         generated_count: int,
     *         updated_count: int,
     *         skipped_count: int,
     *         cadence_period_invoices_created: int,
     *         interim_invoices_created: int
     *     }
     * }
     */
    protected function generateAllMonthlyInvoicesForAgreement(ClientCompany $company, ClientAgreement $agreement): array
    {
        $generated = [];
        $updated = [];
        $skipped = [];

        // Determine termination date (if any)
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)
            : null;

        // Start from the agreement's active date.
        // Always run the loop up to one month ahead of now so that:
        //   - the "upcoming draft" invoice for the current month is created, and
        //   - post-termination periods with unbilled work/expenses are covered.
        $currentDate = Carbon::parse($agreement->active_date)->startOfMonth();
        $endDate = now()->startOfMonth()->addMonth();

        // Precompute all post-termination Y-m periods with any unbilled work or expenses
        // once, to avoid per-month DB queries inside the loop for long-terminated agreements.
        $monthsWithUnbilledPostTermination = null;

        // Generate invoices for each calendar month
        while ($currentDate->lte($endDate)) {
            // Invoice period covers the PRIOR month's work (M-1)
            // The invoice date (retainer renewal) is the first of month M
            $priorMonth = $currentDate->copy()->subMonth();
            $periodStart = $priorMonth->copy()->startOfMonth();
            $periodEnd = $priorMonth->copy()->endOfMonth();

            // Determine whether this period is entirely after the termination date.
            // A period is "post-termination" when its START is after the termination date,
            // meaning the entire work period falls beyond the agreement end.
            // We use periodStart (not periodEnd) to avoid time-of-day comparison issues
            // (endOfMonth returns 23:59:59 while termination_date is stored at 00:00:00).
            $isPostTermination = $terminationDate !== null && $periodStart->gt($terminationDate);

            // Check if invoice already exists for this period.
            // Use whereDate() since period_start/period_end are DATE columns in MySQL and
            // Carbon's endOfMonth() returns 23:59:59 which won't match a DATE value.
            $existingInvoice = ClientInvoice::where('client_company_id', $company->id)
                ->whereDate('period_start', $periodStart->toDateString())
                ->whereDate('period_end', $periodEnd->toDateString())
                ->first();

            // For post-termination periods with no existing invoice, only create a new
            // one when there is actually something to bill (unbilled hours or expenses).
            // The set of billable post-termination months is computed once (lazy) and reused.
            $skipPostTermination = false;
            if ($isPostTermination && ! $existingInvoice) {
                if ($monthsWithUnbilledPostTermination === null) {
                    $monthsWithUnbilledPostTermination = [];

                    if ($terminationDate !== null) {
                        $workMonths = ClientTimeEntry::where('client_company_id', $company->id)
                            ->where('is_billable', true)
                            ->whereNull('client_invoice_line_id')
                            ->where('date_worked', '>', $terminationDate->toDateString())
                            ->pluck('date_worked')
                            ->map(fn ($date): string => substr((string) $date, 0, 7))
                            ->all();

                        $expenseMonths = ClientExpense::where('client_company_id', $company->id)
                            ->where('is_reimbursable', true)
                            ->whereNull('client_invoice_line_id')
                            ->where('expense_date', '>', $terminationDate->toDateString())
                            ->pluck('expense_date')
                            ->map(fn ($date): string => substr((string) $date, 0, 7))
                            ->all();

                        $monthsWithUnbilledPostTermination = array_fill_keys(
                            array_unique(array_merge($workMonths, $expenseMonths)),
                            true
                        );
                    }
                }

                if (! isset($monthsWithUnbilledPostTermination[$periodStart->format('Y-m')])) {
                    $skipPostTermination = true;
                }
            }

            if (! $skipPostTermination) {
                if ($existingInvoice) {
                    // Skip if invoice is issued, paid, or voided
                    if (in_array($existingInvoice->status, ['issued', 'paid', 'void'])) {
                        $skipped[] = [
                            'period' => $periodStart->format('Y-m'),
                            'invoice_id' => $existingInvoice->client_invoice_id,
                            'status' => $existingInvoice->status,
                            'reason' => 'Invoice already exists with status: '.$existingInvoice->status,
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
                'cadence_period_invoices_created' => count($generated),
                'interim_invoices_created' => 0,
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
        if (! $agreement) {
            $agreement = $company->activeAgreement();
            if (! $agreement) {
                throw new \Exception('No active agreement found for this client company.');
            }
        }

        if ($agreement->effectiveBillingCadence() !== BillingCadence::Monthly) {
            $cycle = $this->billingCycleResolver->cycleContaining($agreement, $periodStart);
            if (! $periodStart->isSameDay($cycle->start) || ! $periodEnd->isSameDay($cycle->end)) {
                throw new \Exception(
                    'Manual invoices inside an active '.$agreement->effectiveBillingCadence()->value.
                    ' billing cycle are not supported. Generate the full cadence cycle instead.'
                );
            }

            return $this->generateCadencePeriodInvoice($company, $agreement, $cycle);
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
                "An invoice (#{$overlappingInvoice->invoice_number}) already exists for an overlapping period ".
                "({$overlappingInvoice->period_start->format('M d, Y')} - {$overlappingInvoice->period_end->format('M d, Y')}). ".
                'Please choose a different date range or void the existing invoice first.'
            );
        }

        return DB::transaction(function () use ($company, $agreement, $periodStart, $periodEnd, $invoice) {
            // Get all months from agreement start OR earliest time entry to current period end
            $agreementStart = Carbon::parse($agreement->active_date)->startOfMonth();

            // Determine termination info for post-termination handling
            $terminationDate = $agreement->termination_date
                ? Carbon::parse($agreement->termination_date)
                : null;
            $terminationMonthKey = $terminationDate ? $terminationDate->format('Y-m') : null;

            // The retainer month (M) is the month after the work period.
            // If it falls after the termination date, no retainer fee is charged.
            $retainerMonthStart = $periodEnd->copy()->addDay()->startOfMonth(); // First of M
            $isRetainerMonthPostTermination = $terminationDate !== null
                && $retainerMonthStart->gt($terminationDate);

            $earliestEntryDate = ClientTimeEntry::where('client_company_id', $company->id)
                ->where('is_billable', true)
                ->min('date_worked');

            $calculationStart = $earliestEntryDate
                ? min($agreementStart, Carbon::parse($earliestEntryDate)->startOfMonth())
                : $agreementStart;

            $calculationEnd = $retainerMonthStart->copy();

            // Collect all billable minutes by month
            $allEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->where('is_billable', true)
                ->where('date_worked', '<=', $periodEnd)
                ->get()
                ->groupBy(fn ($e) => Carbon::parse($e->date_worked)->format('Y-m'));

            $months = [];
            $firstPostTerminationSeen = false;
            $currentCalculationDate = $calculationStart->copy();
            while ($currentCalculationDate->lte($calculationEnd)) {
                $monthKey = $currentCalculationDate->format('Y-m');
                $monthEntries = $allEntries->get($monthKey, collect());
                $minutesWorked = $monthEntries->sum('minutes_worked');

                $isPreAgreement = $monthKey < $agreementStart->format('Y-m');

                // Months after the termination month receive zero retainer hours.
                // The termination month itself still carries its full retainer.
                $isPostTerminationMonth = $terminationMonthKey !== null
                    && $monthKey > $terminationMonthKey;

                // Flag the very first post-termination month so RolloverCalculator
                // can clear the rollover history (unused hours are forfeited).
                $resetRollover = $isPostTerminationMonth && ! $firstPostTerminationSeen;
                if ($resetRollover) {
                    $firstPostTerminationSeen = true;
                }

                $months[] = [
                    'year_month' => $monthKey,
                    'retainer_hours' => ($isPreAgreement || $isPostTerminationMonth)
                        ? 0.0
                        : (float) $agreement->monthly_retainer_hours,
                    'hours_worked' => $minutesWorked / 60,
                    'reset_rollover' => $resetRollover,
                ];
                $currentCalculationDate->addMonth();
            }

            // Calculate balances chronologically
            $calculator = new RolloverCalculator;
            /** @var MonthSummary[] $allBalances */
            $allBalances = $calculator->calculateMultipleMonths($months, (int) $agreement->rollover_months);

            Log::debug('Rollover Calculation Results', [
                'months' => $months,
                'results' => collect($allBalances)->map(fn ($b) => [
                    'm' => $b->yearMonth,
                    'used_rollover' => $b->closing->hoursUsedFromRollover,
                    'unused' => $b->closing->unusedHours,
                    'opening_avail' => $b->opening->totalAvailable,
                    'opening_offset' => $b->opening->negativeOffset,
                ]),
            ]);

            // With the new period semantics, periodStart/periodEnd IS the work period (M-1)
            // The retainer month (M) is the month after periodEnd
            $workPeriodStart = $periodStart;
            $workPeriodEnd = $periodEnd;

            // The regular splitter only considers NON-deferred entries. Deferred
            // entries are allocated separately by DeferredBillingAllocator and
            // are never split.
            $priorMonthEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->where('is_deferred_billing', false)
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
            if (! $currentMonthBalance) {
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

            // Find balance for the work period month (M-1) to get end-of-period state for tests
            $workMonthKey = $periodEnd->format('Y-m');
            $workMonthBalance = null;
            foreach ($allBalances as $balance) {
                if ($balance->yearMonth === $workMonthKey) {
                    $workMonthBalance = $balance;
                    break;
                }
            }

            // Total hours billed at rate in history up to this period (including this one)
            $totalBilledOverages = ClientInvoice::where('client_agreement_id', $agreement->id)
                ->whereNotIn('status', ['void'])
                ->where('period_end', '<=', $periodEnd)
                ->sum('hours_billed_at_rate');

            // Work period end-of-month state (after M-1 work, before M retainer)
            $rawWorkPeriodNegative = $workMonthBalance ? $workMonthBalance->closing->negativeBalance : 0;
            $rawWorkPeriodUnused = $workMonthBalance ? $workMonthBalance->closing->unusedHours : 0;

            // Apply catch-up/overage payoffs to M-1 state
            $netWorkPeriodNegative = max(0, $rawWorkPeriodNegative - $totalBilledOverages);
            $netWorkPeriodUnused = $rawWorkPeriodUnused;
            if ($totalBilledOverages > $rawWorkPeriodNegative) {
                $netWorkPeriodUnused += ($totalBilledOverages - $rawWorkPeriodNegative);
            }

            // Prepare invoice data
            // For post-termination work periods, the retainer_hours_included is 0
            // because no new retainer is being charged for that month.
            $invoiceRetainerHours = $isRetainerMonthPostTermination
                ? 0.0
                : (float) $agreement->monthly_retainer_hours;

            $invoiceData = [
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $periodStart,
                'period_end' => $periodEnd,
                'retainer_hours_included' => $invoiceRetainerHours,
                'hours_worked' => $priorMonthEntries->sum('minutes_worked') / 60,
                'rollover_hours_used' => $workMonthBalance ? $workMonthBalance->closing->hoursUsedFromRollover : 0,
                'unused_hours_balance' => $netWorkPeriodUnused,
                'negative_hours_balance' => $netWorkPeriodNegative,
                'starting_unused_hours' => $cumulativeSnapshot['unused'],
                'starting_negative_hours' => $cumulativeSnapshot['negative'],
                'hours_billed_at_rate' => 0, // We'll set this if we decide to bill overage
                'status' => 'draft',
                'invoice_kind' => InvoiceKind::CadencePeriod->value,
                'cycle_start' => $periodStart,
                'cycle_end' => $periodEnd,
            ];

            if ($invoice) {
                // Update existing draft invoice
                $invoice->update($invoiceData);

                // Delete system-generated line items (includes milestone lines for billable tasks)
                $systemGeneratedTypes = InvoiceLineType::systemGeneratedValues();
                $systemLines = $invoice->lineItems()->whereIn('line_type', $systemGeneratedTypes)->get();
                foreach ($systemLines as $line) {
                    $line->timeEntries()->update(['client_invoice_line_id' => null]);
                    $line->tasks()->update(['client_invoice_line_id' => null]);
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
            $allocationService = new AllocationService;
            $allocationService->recombineUnlinkedFragments($company->id);

            // Re-fetch unbilled work period entries after recombination
            $priorMonthEntries = ClientTimeEntry::where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->where('is_deferred_billing', false)
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
            $m1_invoice = $history->first(fn ($inv) => $inv->period_start->format('Y-m') === $priorMonthKey);
            $alreadyBilledM1 = $m1_invoice ? $m1_invoice->hours_worked : 0;

            // Calculate capacities:
            // 1. Prior Month Capacity: What Jan has itself (including Jan's rollover from Dec)
            // 2. Current Month Capacity: What Feb has available to cover Jan's overage (M retainer)
            // For post-termination invoices, the current month capacity is 0 since no retainer
            // is being charged for the retainer month.
            $priorMonthCapacity = $priorMonthBalance ? $priorMonthBalance->opening->totalAvailable : 0;
            $currentMonthCapacity = $isRetainerMonthPostTermination
                ? 0.0
                : (float) $agreement->monthly_retainer_hours;
            // For post-termination invoices, there is no minimum availability to maintain.
            $catchUpThreshold = $isRetainerMonthPostTermination
                ? 0.0
                : (float) ($agreement->catch_up_threshold_hours ?? 1.0);

            // Use TimeEntrySplitter to allocate time entries
            $splitter = new TimeEntrySplitter;
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
                    'quantity' => '',
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
                    'quantity' => '',
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
                    'description' => 'Catch-up hours for prior month overage and minimum availability',
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

                // Re-calculate work period balances as well
                $totalBilledOveragesUpdated = ClientInvoice::where('client_agreement_id', $agreement->id)
                    ->whereNotIn('status', ['void'])
                    ->where('period_end', '<=', $periodEnd)
                    ->sum('hours_billed_at_rate');

                $netWorkPeriodNegativeUpdated = max(0, $rawWorkPeriodNegative - $totalBilledOveragesUpdated);
                $netWorkPeriodUnusedUpdated = $rawWorkPeriodUnused;
                if ($totalBilledOveragesUpdated > $rawWorkPeriodNegative) {
                    $netWorkPeriodUnusedUpdated += ($totalBilledOveragesUpdated - $rawWorkPeriodNegative);
                }

                $invoice->update([
                    'negative_hours_balance' => $netWorkPeriodNegativeUpdated,
                    'unused_hours_balance' => $netWorkPeriodUnusedUpdated,
                    'starting_unused_hours' => $cumulativeSnapshot['unused'],
                    'starting_negative_hours' => $cumulativeSnapshot['negative'],
                ]);
            }

            // Now process all fragments and link them to lines, handling splits correctly
            $this->linkAllFragmentsToLines($fragmentsToLines, $splitter);

            // Monthly retainer fee for month M (the month after the work period).
            // Not charged when the agreement was terminated before the retainer month.
            if (! $isRetainerMonthPostTermination) {
                $retainerMonthEnd = $retainerMonthStart->copy()->endOfMonth();
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Monthly Retainer ({$agreement->monthly_retainer_hours} hours) - ".
                                    $retainerMonthStart->format('M j, Y').' through '.$retainerMonthEnd->format('M j, Y'),
                    'quantity' => '1',
                    'unit_price' => $agreement->monthly_retainer_fee,
                    'line_total' => $agreement->monthly_retainer_fee,
                    'line_type' => 'retainer',
                    'hours' => (float) $agreement->monthly_retainer_hours,
                    'line_date' => $retainerMonthStart,
                    'sort_order' => $sortOrder++,
                ]);
            }

            $this->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);
            $this->addBillableMilestoneTasks($company, $invoice, $periodEnd, $sortOrder);
            $this->addRecurringItemLines($invoice, $agreement, $periodStart, $periodEnd, $sortOrder);

            // Deferred-billing allocator: never splits, never triggers catch-up.
            // Termination mode force-bills all outstanding deferred entries at hourly rate.
            $deferredAllocator = new DeferredBillingAllocator;
            if ($isRetainerMonthPostTermination) {
                $deferredToBill = $deferredAllocator->collectForTermination($company, $periodEnd);
                if ($deferredToBill->isNotEmpty()) {
                    $this->addDeferredTerminationLine($invoice, $agreement, $deferredToBill, $sortOrder);
                }
                $this->deferredSkipped = [];
            } else {
                $remainingCapacity =
                    ($priorMonthCapacity - $plan->totalPriorMonthRetainerHours) +
                    ($currentMonthCapacity - $plan->totalCurrentMonthRetainerHours);
                $deferredResult = $deferredAllocator->allocate($company, $periodEnd, $remainingCapacity);
                if ($deferredResult->hasBilled()) {
                    $this->addDeferredRetainerLine($invoice, $agreement, $deferredResult, $periodEnd, $sortOrder);
                }
                $this->deferredSkipped = $deferredResult->skipped;
            }

            // Apply any rolling overpayment credit AFTER all other lines have been placed.
            (new OverpaymentCreditService)->applyCreditsToDraftInvoice($invoice);

            $invoice->recalculateTotal();
            $this->updateInvoicePeriodFromLineItems($invoice);

            ClientCompanyActivity::record($company, 'invoice.generated', $invoice, [
                'invoice_kind' => $invoice->invoiceKindValue(),
                'period_start' => $invoice->period_start?->toDateString(),
                'period_end' => $invoice->period_end?->toDateString(),
                'invoice_total' => (float) $invoice->invoice_total,
            ]);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Generate cadence-period invoices for a non-monthly agreement.
     *
     * @return array{
     *     generated: list<array<string, mixed>>,
     *     updated: list<array<string, mixed>>,
     *     skipped: list<array<string, mixed>>,
     *     summary: array{
     *         generated_count: int,
     *         updated_count: int,
     *         skipped_count: int,
     *         cadence_period_invoices_created: int,
     *         interim_invoices_created: int
     *     }
     * }
     */
    protected function generateAllCadenceInvoices(ClientCompany $company, ClientAgreement $agreement): array
    {
        $through = $agreement->effectiveBillingCadence()->cycleEnd(now());
        $billExcessImmediately = (bool) $agreement->bill_overage_interim;
        $cycleLedger = $this->buildAgreementLedgerThrough(
            $company,
            $agreement,
            $through,
            $billExcessImmediately,
        );
        $immediateLedger = $billExcessImmediately ? $cycleLedger : null;
        $generated = [];
        $updated = [];
        $skipped = [];

        foreach ($this->billingCycleResolver->cyclesForAgreement($agreement, $through) as $cycle) {
            $interimResults = $this->ensureInterimOveragesForCycle($company, $agreement, $cycle, $immediateLedger);
            foreach ($interimResults['generated'] as $result) {
                $generated[] = $result;
            }
            foreach ($interimResults['updated'] as $result) {
                $updated[] = $result;
            }

            $existingInvoice = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                ->whereDate('period_start', $cycle->start->toDateString())
                ->whereDate('period_end', $cycle->end->toDateString())
                ->first();

            $periodLabel = $this->formatPeriodLabel($cycle->start, $cycle->end);
            if ($existingInvoice && in_array($existingInvoice->status, ['issued', 'paid', 'void'], true)) {
                $skipped[] = [
                    'period' => $periodLabel,
                    'invoice_id' => $existingInvoice->client_invoice_id,
                    'status' => $existingInvoice->status,
                    'reason' => 'Invoice already exists with status: '.$existingInvoice->status,
                ];

                continue;
            }

            try {
                $invoice = $this->generateCadencePeriodInvoice($company, $agreement, $cycle, false, $cycleLedger);
                $result = [
                    'period' => $periodLabel,
                    'invoice_id' => $invoice->client_invoice_id,
                    'invoice_number' => $invoice->invoice_number,
                    'invoice_kind' => $invoice->invoiceKindValue(),
                ];

                if ($existingInvoice) {
                    $updated[] = $result;
                } else {
                    $generated[] = $result;
                }
            } catch (\Exception $e) {
                $skipped[] = [
                    'period' => $periodLabel,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return [
            'generated' => $generated,
            'updated' => $updated,
            'skipped' => $skipped,
            'summary' => [
                'generated_count' => count($generated),
                'updated_count' => count($updated),
                'skipped_count' => count($skipped),
                'cadence_period_invoices_created' => collect($generated)
                    ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                    ->count(),
                'interim_invoices_created' => collect($generated)
                    ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                    ->count(),
            ],
        ];
    }

    /**
     * Generate or refresh one full cadence-period invoice.
     *
     * @param  array<int, MonthSummary>|null  $ledger
     * @param  array<int, MonthSummary>|null  $immediateLedger
     */
    protected function generateCadencePeriodInvoice(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $cycle,
        bool $generateMissingInterims = true,
        ?array $ledger = null,
        ?array $immediateLedger = null,
    ): ClientInvoice {
        $periodStart = $cycle->start->copy()->startOfDay();
        $periodEnd = $cycle->end->copy()->startOfDay();

        return DB::transaction(function () use ($company, $agreement, $cycle, $periodStart, $periodEnd, $generateMissingInterims, $ledger, $immediateLedger): ClientInvoice {
            // Serialize generation for this agreement; invoice rows below may not exist yet.
            ClientAgreement::query()
                ->whereKey($agreement->getKey())
                ->lockForUpdate()
                ->first();

            if ((bool) $agreement->bill_overage_interim) {
                $ledger ??= $this->buildAgreementLedgerThrough($company, $agreement, $periodEnd, true);
                $immediateLedger ??= $ledger;
            }

            if ($generateMissingInterims) {
                $this->ensureInterimOveragesForCycle($company, $agreement, $cycle, $immediateLedger);
            }

            $invoice = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                ->whereDate('period_start', $periodStart->toDateString())
                ->whereDate('period_end', $periodEnd->toDateString())
                ->whereNotIn('status', ['void'])
                ->lockForUpdate()
                ->first();

            if ($invoice && $invoice->isIssued()) {
                throw new \Exception("An issued invoice (#{$invoice->invoice_number}) already exists for this cadence cycle and cannot be modified.");
            }

            $overlappingInvoice = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->whereNotIn('status', ['void'])
                ->where('invoice_kind', '!=', InvoiceKind::InterimOverage->value)
                ->where(function ($query) use ($periodStart, $periodEnd): void {
                    $query->where('period_start', '<', $periodEnd)
                        ->where('period_end', '>', $periodStart);
                })
                ->when($invoice, function ($query) use ($invoice): void {
                    $query->where('client_invoice_id', '!=', $invoice->client_invoice_id);
                })
                ->lockForUpdate()
                ->first();

            if ($overlappingInvoice) {
                throw new \Exception(
                    "An invoice (#{$overlappingInvoice->invoice_number}) already exists for an overlapping period ".
                    "({$overlappingInvoice->period_start->format('M d, Y')} - {$overlappingInvoice->period_end->format('M d, Y')}). ".
                    'Please void the existing invoice before generating the cadence cycle.'
                );
            }

            $agreement->loadMissing('recurringItems');

            if ($invoice) {
                $invoice->update([
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'cycle_start' => $periodStart,
                    'cycle_end' => $periodEnd,
                    'invoice_kind' => InvoiceKind::CadencePeriod->value,
                    'status' => 'draft',
                ]);
                $this->resetSystemGeneratedLines($invoice);
            } else {
                // For cadence-period invoices the invoice period and cadence cycle match.
                // Interim-overage invoices will use the same cycle columns while keeping
                // their own narrower monthly period.
                $invoice = ClientInvoice::create([
                    'client_company_id' => $company->id,
                    'client_agreement_id' => $agreement->id,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'invoice_number' => $this->generateInvoiceNumber($company, $agreement, $periodEnd),
                    'invoice_total' => 0,
                    'status' => 'draft',
                    'invoice_kind' => InvoiceKind::CadencePeriod->value,
                    'cycle_start' => $periodStart,
                    'cycle_end' => $periodEnd,
                ]);
            }

            $sortOrder = 1;
            $allocationService = new AllocationService;
            $allocationService->recombineUnlinkedFragments($company->id);

            $ledger ??= $this->buildAgreementLedgerThrough(
                $company,
                $agreement,
                $periodEnd,
                (bool) $agreement->bill_overage_interim,
            );
            $cycleLedger = $this->summarizeLedgerForCycle($agreement, $ledger, $cycle);
            $interimBilledHours = $this->interimOverageHoursForCycle($agreement, $cycle);

            $entries = ClientTimeEntry::query()
                ->where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->where('is_deferred_billing', false)
                ->whereBetween('date_worked', [$periodStart, $periodEnd])
                ->orderBy('date_worked')
                ->orderBy('id')
                ->get();

            $retainerHours = $cycleLedger['retainer_hours'];
            $retainerFee = round((float) $agreement->monthly_retainer_fee * $cycleLedger['retainer_multiplier'], 2);

            $splitter = new TimeEntrySplitter;
            $plan = $splitter->allocateTimeEntries(
                $entries,
                $cycleLedger['covered_hours'],
                0.0,
                0.0,
            );

            $fragmentsToLines = [];
            if (count($plan->priorMonthRetainerFragments) > 0) {
                $hours = $plan->totalPriorMonthRetainerHours;
                $line = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => "Work items applied to {$agreement->effectiveBillingCadence()->value} retainer ({$this->formatHoursForQuantity($hours)} applied to {$this->formatPeriodLabel($periodStart, $periodEnd)} cycle)",
                    'quantity' => '',
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => InvoiceLineType::PriorMonthRetainer->value,
                    'hours' => $hours,
                    'line_date' => $periodEnd,
                    'sort_order' => $sortOrder++,
                ]);
                $fragmentsToLines[$line->client_invoice_line_id] = $plan->priorMonthRetainerFragments;
            }

            $overageHours = $plan->totalCatchUpHours + $plan->totalBillableCatchupHours;
            if ($overageHours > 0) {
                $line = ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Additional hours beyond cadence retainer',
                    'quantity' => $this->formatHoursForQuantity($overageHours),
                    'unit_price' => $agreement->hourly_rate,
                    'line_total' => round($overageHours * (float) $agreement->hourly_rate, 2),
                    'line_type' => InvoiceLineType::AdditionalHours->value,
                    'hours' => $overageHours,
                    'line_date' => $periodEnd,
                    'sort_order' => $sortOrder++,
                ]);
                $fragmentsToLines[$line->client_invoice_line_id] = array_merge(
                    $plan->catchUpFragments,
                    $plan->billableCatchupFragments,
                );
            }

            if ($interimBilledHours > 0) {
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => 'Already billed in this cycle via interim overage invoices',
                    'quantity' => $this->formatHoursForQuantity($interimBilledHours),
                    'unit_price' => 0,
                    'line_total' => 0,
                    'line_type' => InvoiceLineType::Reconciliation->value,
                    'hours' => $interimBilledHours,
                    'line_date' => $periodEnd,
                    'sort_order' => $sortOrder++,
                ]);
            }

            $this->linkAllFragmentsToLines($fragmentsToLines, $splitter);

            ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => ucfirst($agreement->effectiveBillingCadence()->value)." Retainer ({$retainerHours} hours) - ".
                                $periodStart->format('M j, Y').' through '.$periodEnd->format('M j, Y'),
                'quantity' => '1',
                'unit_price' => $retainerFee,
                'line_total' => $retainerFee,
                'line_type' => InvoiceLineType::Retainer->value,
                'hours' => $retainerHours,
                'line_date' => $periodStart,
                'sort_order' => $sortOrder++,
            ]);

            $this->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);
            $this->addBillableMilestoneTasks($company, $invoice, $periodEnd, $sortOrder);
            $this->addRecurringItemLines($invoice, $agreement, $periodStart, $periodEnd, $sortOrder);

            $remainingCapacity = max(0.0, $cycleLedger['covered_hours'] - $plan->totalPriorMonthRetainerHours);
            $deferredResult = (new DeferredBillingAllocator)->allocate($company, $periodEnd, $remainingCapacity);
            if ($deferredResult->hasBilled()) {
                $this->addDeferredRetainerLine($invoice, $agreement, $deferredResult, $periodEnd, $sortOrder);
                $remainingCapacity = max(0.0, $remainingCapacity - $deferredResult->hoursBilled);
            }
            $this->deferredSkipped = $deferredResult->skipped;

            $hoursWorked = $cycleLedger['hours_worked'];
            $negativeBalance = max(0.0, $cycleLedger['negative_hours'] - $overageHours - $interimBilledHours);
            $invoice->update([
                'retainer_hours_included' => $retainerHours,
                'hours_worked' => $hoursWorked,
                'rollover_hours_used' => $cycleLedger['rollover_hours_used'],
                'unused_hours_balance' => $cycleLedger['unused_hours'],
                'negative_hours_balance' => round($negativeBalance, 4),
                'starting_unused_hours' => $cycleLedger['starting_unused_hours'],
                'starting_negative_hours' => $cycleLedger['starting_negative_hours'],
                'hours_billed_at_rate' => $overageHours,
            ]);

            (new OverpaymentCreditService)->applyCreditsToDraftInvoice($invoice);
            $invoice->recalculateTotal();

            ClientCompanyActivity::record($company, 'invoice.generated', $invoice, [
                'invoice_kind' => $invoice->invoiceKindValue(),
                'period_start' => $invoice->period_start?->toDateString(),
                'period_end' => $invoice->period_end?->toDateString(),
                'cycle_start' => $invoice->cycle_start?->toDateString(),
                'cycle_end' => $invoice->cycle_end?->toDateString(),
                'invoice_total' => (float) $invoice->invoice_total,
            ]);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Generate or refresh a monthly interim overage invoice inside a non-monthly cycle.
     *
     * @param  array<int, MonthSummary>|null  $immediateLedger
     */
    public function generateInterimOverageInvoice(
        ClientCompany $company,
        Carbon $monthStart,
        ?ClientAgreement $agreement = null,
        ?array $immediateLedger = null,
    ): ?ClientInvoice {
        $periodStart = $monthStart->copy()->startOfMonth()->startOfDay();
        $agreement = $agreement ?? $this->agreementCoveringDate($company, $periodStart);

        if (! $agreement) {
            throw new \Exception('No agreement found for this interim overage period.');
        }

        if ($agreement->effectiveBillingCadence() === BillingCadence::Monthly) {
            throw new \Exception('Interim overage invoices only apply to non-monthly billing cadences.');
        }

        if (! (bool) $agreement->bill_overage_interim) {
            return null;
        }

        $cycle = $this->billingCycleResolver->cycleContaining($agreement, $periodStart);
        $activeDate = Carbon::parse($agreement->active_date)->startOfDay();
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)->startOfDay()
            : null;

        if ($periodStart->lt($cycle->start)) {
            $periodStart = $cycle->start->copy();
        }
        if ($periodStart->lt($activeDate)) {
            $periodStart = $activeDate->copy();
        }

        $periodEnd = $monthStart->copy()->endOfMonth()->startOfDay();
        if ($periodEnd->gt($cycle->end)) {
            $periodEnd = $cycle->end->copy();
        }
        if ($terminationDate && $periodEnd->gt($terminationDate)) {
            $periodEnd = $terminationDate->copy();
        }

        if ($periodEnd->gte($cycle->end)) {
            return null;
        }

        return DB::transaction(function () use ($company, $agreement, $cycle, $periodStart, $periodEnd, $immediateLedger): ?ClientInvoice {
            // Serialize interim generation for this agreement; invoice rows below may not exist yet.
            ClientAgreement::query()
                ->whereKey($agreement->getKey())
                ->lockForUpdate()
                ->first();

            $issuedCycleInvoice = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
                ->whereDate('cycle_start', $cycle->start->toDateString())
                ->whereDate('cycle_end', $cycle->end->toDateString())
                ->whereIn('status', ['issued', 'paid'])
                ->lockForUpdate()
                ->first();

            if ($issuedCycleInvoice) {
                throw new \Exception("A cadence invoice (#{$issuedCycleInvoice->invoice_number}) already exists for this cycle.");
            }

            $existingInvoice = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->whereDate('period_start', $periodStart->toDateString())
                ->whereDate('period_end', $periodEnd->toDateString())
                ->whereDate('cycle_start', $cycle->start->toDateString())
                ->whereDate('cycle_end', $cycle->end->toDateString())
                ->whereNotIn('status', ['void'])
                ->lockForUpdate()
                ->first();

            if ($existingInvoice && $existingInvoice->isIssued()) {
                throw new \Exception("An issued interim invoice (#{$existingInvoice->invoice_number}) already exists for this period and cannot be modified.");
            }

            // Interim invoices read MonthSummary::closing->excessHours, which is populated only with immediate-excess ledgers.
            $immediateLedger ??= $this->buildAgreementLedgerThrough($company, $agreement, $periodEnd, true);
            $cumulativeExcessHours = $this->cumulativeInterimExcessHoursThrough($immediateLedger, $cycle, $periodEnd);
            $alreadyBilledHours = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                ->whereDate('cycle_start', $cycle->start->toDateString())
                ->whereDate('cycle_end', $cycle->end->toDateString())
                ->whereDate('period_end', '<', $periodStart->toDateString())
                ->whereNotIn('status', ['void'])
                ->sum('hours_billed_at_rate');

            $targetOverageHours = round(max(0.0, $cumulativeExcessHours - (float) $alreadyBilledHours), 4);
            if ($targetOverageHours <= 0.0) {
                return null;
            }

            (new AllocationService)->recombineUnlinkedFragments($company->id);

            $entries = ClientTimeEntry::query()
                ->where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->where('is_deferred_billing', false)
                ->whereBetween('date_worked', [$periodStart, $periodEnd])
                ->orderBy('date_worked')
                ->orderBy('id')
                ->get();

            $entryHours = round($entries->sum('minutes_worked') / 60, 4);
            $overageHours = round(min($targetOverageHours, $entryHours), 4);
            if ($overageHours <= 0.0) {
                return null;
            }

            if ($existingInvoice) {
                $invoice = $existingInvoice;
                $invoice->update([
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'cycle_start' => $cycle->start,
                    'cycle_end' => $cycle->end,
                    'invoice_kind' => InvoiceKind::InterimOverage->value,
                    'status' => 'draft',
                ]);
                $this->resetSystemGeneratedLines($invoice);
            } else {
                $invoice = ClientInvoice::create([
                    'client_company_id' => $company->id,
                    'client_agreement_id' => $agreement->id,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'invoice_number' => $this->generateInvoiceNumber($company, $agreement, $periodEnd),
                    'invoice_total' => 0,
                    'status' => 'draft',
                    'invoice_kind' => InvoiceKind::InterimOverage->value,
                    'cycle_start' => $cycle->start,
                    'cycle_end' => $cycle->end,
                ]);
            }

            $splitter = new TimeEntrySplitter;
            $plan = $splitter->allocateTimeEntries(
                $entries,
                max(0.0, $entryHours - $overageHours),
                0.0,
                0.0,
            );

            $billableFragments = array_merge(
                $plan->catchUpFragments,
                $plan->billableCatchupFragments,
            );

            $line = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => 'Interim overage hours for '.$periodStart->format('F Y'),
                'quantity' => $this->formatHoursForQuantity($overageHours),
                'unit_price' => $agreement->hourly_rate,
                'line_total' => round($overageHours * (float) $agreement->hourly_rate, 2),
                'line_type' => InvoiceLineType::AdditionalHours->value,
                'hours' => $overageHours,
                'line_date' => $periodEnd,
                'sort_order' => 1,
            ]);

            $this->linkAllFragmentsToLines([
                $line->client_invoice_line_id => $billableFragments,
            ], $splitter);

            $monthSummary = $this->findLedgerMonth($immediateLedger, $periodEnd->format('Y-m'));
            $invoice->update([
                'retainer_hours_included' => 0,
                'hours_worked' => $entryHours,
                'rollover_hours_used' => $monthSummary ? $monthSummary->closing->hoursUsedFromRollover : 0,
                'unused_hours_balance' => $monthSummary ? $monthSummary->closing->unusedHours + $monthSummary->closing->remainingRollover : 0,
                'negative_hours_balance' => 0,
                'starting_unused_hours' => $monthSummary ? $monthSummary->opening->rolloverHours : 0,
                'starting_negative_hours' => $monthSummary ? $monthSummary->opening->negativeOffset + $monthSummary->opening->remainingNegativeBalance : 0,
                'hours_billed_at_rate' => $overageHours,
            ]);

            (new OverpaymentCreditService)->applyCreditsToDraftInvoice($invoice);
            $invoice->recalculateTotal();

            ClientCompanyActivity::record($company, 'invoice.generated', $invoice, [
                'invoice_kind' => $invoice->invoiceKindValue(),
                'period_start' => $invoice->period_start?->toDateString(),
                'period_end' => $invoice->period_end?->toDateString(),
                'cycle_start' => $invoice->cycle_start?->toDateString(),
                'cycle_end' => $invoice->cycle_end?->toDateString(),
                'invoice_total' => (float) $invoice->invoice_total,
            ]);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Generate missing interim overage invoices for completed month boundaries inside a cycle.
     *
     * @param  array<int, MonthSummary>|null  $immediateLedger
     * @return array{generated: list<array<string, mixed>>, updated: list<array<string, mixed>>}
     */
    protected function ensureInterimOveragesForCycle(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $cycle,
        ?array $immediateLedger = null,
    ): array {
        $results = [
            'generated' => [],
            'updated' => [],
        ];

        if ($agreement->effectiveBillingCadence() === BillingCadence::Monthly || ! (bool) $agreement->bill_overage_interim) {
            return $results;
        }

        $cursor = $cycle->start->copy()->startOfMonth();
        $today = now()->startOfDay();

        while ($cursor->lte($cycle->end)) {
            $periodStart = $cursor->copy()->startOfMonth();
            if ($periodStart->lt($cycle->start)) {
                $periodStart = $cycle->start->copy();
            }

            $periodEnd = $cursor->copy()->endOfMonth()->startOfDay();
            if ($periodEnd->gt($cycle->end)) {
                $periodEnd = $cycle->end->copy();
            }

            if ($periodEnd->lt($cycle->end) && $periodEnd->lte($today)) {
                $existingInvoice = ClientInvoice::query()
                    ->where('client_company_id', $company->id)
                    ->where('client_agreement_id', $agreement->id)
                    ->where('invoice_kind', InvoiceKind::InterimOverage->value)
                    ->whereDate('period_start', $periodStart->toDateString())
                    ->whereDate('period_end', $periodEnd->toDateString())
                    ->whereDate('cycle_start', $cycle->start->toDateString())
                    ->whereDate('cycle_end', $cycle->end->toDateString())
                    ->whereNotIn('status', ['void'])
                    ->first();

                if ($existingInvoice && in_array($existingInvoice->status, ['issued', 'paid'], true)) {
                    $cursor->addMonth()->startOfMonth();

                    continue;
                }

                $invoice = $this->generateInterimOverageInvoice($company, $periodStart, $agreement, $immediateLedger);
                if ($invoice) {
                    $result = [
                        'period' => $this->formatPeriodLabel($periodStart, $periodEnd),
                        'invoice_id' => $invoice->client_invoice_id,
                        'invoice_number' => $invoice->invoice_number,
                        'invoice_kind' => $invoice->invoiceKindValue(),
                    ];

                    if ($existingInvoice) {
                        $results['updated'][] = $result;
                    } else {
                        $results['generated'][] = $result;
                    }
                }
            }

            $cursor->addMonth()->startOfMonth();
        }

        return $results;
    }

    /**
     * Build the monthly ledger for one agreement through a given date.
     *
     * @return array<int, MonthSummary>
     */
    protected function buildAgreementLedgerThrough(
        ClientCompany $company,
        ClientAgreement $agreement,
        Carbon $through,
        bool $billExcessImmediately = false,
    ): array {
        $activeDate = Carbon::parse($agreement->active_date)->startOfDay();
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)->startOfDay()
            : null;
        $ledgerEnd = $through->copy()->startOfDay();

        if ($terminationDate && $terminationDate->lt($ledgerEnd)) {
            $ledgerEnd = $terminationDate->copy();
        }

        if ($activeDate->gt($ledgerEnd)) {
            return [];
        }

        $entriesByMonth = ClientTimeEntry::query()
            ->where('client_company_id', $company->id)
            ->where('is_billable', true)
            ->whereBetween('date_worked', [$activeDate, $ledgerEnd])
            ->get()
            ->groupBy(fn (ClientTimeEntry $entry): string => Carbon::parse($entry->date_worked)->format('Y-m'));

        $months = [];
        $initialRolloverHours = (float) ($agreement->initial_rollover_hours ?? 0);
        if ($initialRolloverHours > 0) {
            $months[] = [
                'year_month' => $activeDate->copy()->startOfMonth()->subMonth()->format('Y-m'),
                'retainer_hours' => round($initialRolloverHours, 4),
                'hours_worked' => 0.0,
                'reset_rollover' => false,
            ];
        }

        $cursor = $activeDate->copy()->startOfMonth();
        while ($cursor->lte($ledgerEnd)) {
            $monthStart = $cursor->copy()->startOfMonth();
            $monthEnd = $cursor->copy()->endOfMonth()->startOfDay();
            $monthKey = $monthStart->format('Y-m');
            $monthEntries = $entriesByMonth->get($monthKey, collect());
            $retainerMultiplier = $this->monthRetainerMultiplier($agreement, $monthStart, $monthEnd);

            $months[] = [
                'year_month' => $monthKey,
                'retainer_hours' => round((float) $agreement->monthly_retainer_hours * $retainerMultiplier, 4),
                'hours_worked' => round($monthEntries->sum('minutes_worked') / 60, 4),
                'reset_rollover' => false,
            ];

            $cursor->addMonth()->startOfMonth();
        }

        return $this->rolloverCalculator->calculateMultipleMonths(
            $months,
            (int) $agreement->rollover_months,
            $billExcessImmediately,
        );
    }

    /**
     * @param  array<int, MonthSummary>  $ledger
     * @return array{
     *     retainer_hours: float,
     *     retainer_multiplier: float,
     *     covered_hours: float,
     *     hours_worked: float,
     *     rollover_hours_used: float,
     *     unused_hours: float,
     *     negative_hours: float,
     *     starting_unused_hours: float,
     *     starting_negative_hours: float
     * }
     */
    protected function summarizeLedgerForCycle(ClientAgreement $agreement, array $ledger, BillingCycle $cycle): array
    {
        $cycleMonthStart = $cycle->start->copy()->startOfMonth();
        $cycleMonthEnd = $cycle->end->copy()->startOfMonth();
        $cycleSummaries = collect($ledger)
            ->filter(function (MonthSummary $summary) use ($cycleMonthStart, $cycleMonthEnd): bool {
                $monthStart = Carbon::parse($summary->yearMonth.'-01')->startOfDay();

                return $monthStart->betweenIncluded($cycleMonthStart, $cycleMonthEnd);
            })
            ->values();

        /** @var MonthSummary|null $first */
        $first = $cycleSummaries->first();
        /** @var MonthSummary|null $last */
        $last = $cycleSummaries->last();
        $retainerHours = round((float) $cycleSummaries->sum('retainerHours'), 4);
        $monthlyRetainerHours = (float) $agreement->monthly_retainer_hours;

        return [
            'retainer_hours' => $retainerHours,
            'retainer_multiplier' => $monthlyRetainerHours > 0
                ? round($retainerHours / $monthlyRetainerHours, 4)
                : (float) $cycleSummaries->count(),
            'covered_hours' => round((float) $cycleSummaries->sum(
                fn (MonthSummary $summary): float => $summary->closing->hoursUsedFromRetainer
                    + $summary->closing->hoursUsedFromRollover
                    + $summary->opening->negativeOffset
            ), 4),
            'hours_worked' => round((float) $cycleSummaries->sum('hoursWorked'), 4),
            'rollover_hours_used' => round((float) $cycleSummaries->sum(
                fn (MonthSummary $summary): float => $summary->closing->hoursUsedFromRollover
            ), 4),
            'unused_hours' => $last
                ? round($last->closing->unusedHours + $last->closing->remainingRollover, 4)
                : 0.0,
            'negative_hours' => $last ? round($last->closing->negativeBalance, 4) : 0.0,
            'starting_unused_hours' => $first ? round($first->opening->rolloverHours, 4) : 0.0,
            'starting_negative_hours' => $first
                ? round($first->opening->negativeOffset + $first->opening->remainingNegativeBalance, 4)
                : 0.0,
        ];
    }

    protected function monthRetainerMultiplier(ClientAgreement $agreement, Carbon $monthStart, Carbon $monthEnd): float
    {
        $activeDate = Carbon::parse($agreement->active_date)->startOfDay();
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)->startOfDay()
            : null;

        $coveredStart = $activeDate->gt($monthStart) ? $activeDate->copy() : $monthStart->copy();
        $coveredEnd = $monthEnd->copy();
        if ($terminationDate && $terminationDate->lt($coveredEnd)) {
            $coveredEnd = $terminationDate->copy();
        }

        if ($coveredStart->gt($coveredEnd)) {
            return 0.0;
        }

        if ($coveredStart->isSameDay($monthStart) && $coveredEnd->isSameDay($monthEnd)) {
            return 1.0;
        }

        if ($agreement->effectiveFirstCycleProration() === FirstCycleProration::FullPeriod) {
            return 1.0;
        }

        return round(($coveredStart->diffInDays($coveredEnd) + 1) / $monthStart->daysInMonth, 4);
    }

    /**
     * @param  array<int, MonthSummary>  $immediateLedger  Ledger built with billExcessImmediately=true so closing excessHours contains billable interim overage.
     */
    protected function cumulativeInterimExcessHoursThrough(array $immediateLedger, BillingCycle $cycle, Carbon $periodEnd): float
    {
        $cycleMonthStart = $cycle->start->copy()->startOfMonth();
        $periodMonthEnd = $periodEnd->copy()->startOfMonth();

        return round((float) collect($immediateLedger)
            ->filter(function (MonthSummary $summary) use ($cycleMonthStart, $periodMonthEnd): bool {
                $monthStart = Carbon::parse($summary->yearMonth.'-01')->startOfDay();

                return $monthStart->betweenIncluded($cycleMonthStart, $periodMonthEnd);
            })
            ->sum(fn (MonthSummary $summary): float => $summary->closing->excessHours), 4);
    }

    protected function interimOverageHoursForCycle(ClientAgreement $agreement, BillingCycle $cycle): float
    {
        return round((float) ClientInvoice::query()
            ->where('client_agreement_id', $agreement->id)
            ->where('invoice_kind', InvoiceKind::InterimOverage->value)
            ->whereDate('cycle_start', $cycle->start->toDateString())
            ->whereDate('cycle_end', $cycle->end->toDateString())
            ->whereNotIn('status', ['void'])
            ->sum('hours_billed_at_rate'), 4);
    }

    /**
     * @param  array<int, MonthSummary>  $ledger
     */
    protected function findLedgerMonth(array $ledger, string $yearMonth): ?MonthSummary
    {
        foreach ($ledger as $summary) {
            if ($summary->yearMonth === $yearMonth) {
                return $summary;
            }
        }

        return null;
    }

    /**
     * Use active agreement if available; otherwise fall back to the most
     * recently terminated agreement so invoice generation can handle trailing
     * post-termination work.
     */
    protected function agreementForInvoiceGeneration(ClientCompany $company): ClientAgreement
    {
        $agreement = $company->activeAgreement() ?? $company->mostRecentAgreement();
        if (! $agreement) {
            throw new \Exception('No agreement found for this client company.');
        }

        return $agreement;
    }

    /**
     * Return every historical agreement segment that can still produce invoices.
     *
     * @return Collection<int, ClientAgreement>
     */
    protected function agreementsForInvoiceGeneration(ClientCompany $company): Collection
    {
        $agreements = $company->agreements()
            ->where('active_date', '<=', now())
            ->orderBy('active_date')
            ->orderBy('id')
            ->get();

        if ($agreements->isEmpty()) {
            throw new \Exception('No agreement found for this client company.');
        }

        return $agreements;
    }

    protected function agreementCoveringDate(ClientCompany $company, Carbon $date): ?ClientAgreement
    {
        return $company->agreements()
            ->where('active_date', '<=', $date->toDateString())
            ->where(function ($query) use ($date): void {
                $query->whereNull('termination_date')
                    ->orWhere('termination_date', '>=', $date->toDateString());
            })
            ->orderBy('active_date', 'desc')
            ->orderBy('id', 'desc')
            ->first();
    }

    /**
     * @return array{
     *     generated: list<array<string, mixed>>,
     *     updated: list<array<string, mixed>>,
     *     skipped: list<array<string, mixed>>,
     *     summary: array{
     *         generated_count: int,
     *         updated_count: int,
     *         skipped_count: int,
     *         cadence_period_invoices_created: int,
     *         interim_invoices_created: int
     *     }
     * }
     */
    protected function emptyGenerationResults(): array
    {
        return [
            'generated' => [],
            'updated' => [],
            'skipped' => [],
            'summary' => [
                'generated_count' => 0,
                'updated_count' => 0,
                'skipped_count' => 0,
                'cadence_period_invoices_created' => 0,
                'interim_invoices_created' => 0,
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $left
     * @param  array<string, mixed>  $right
     * @return array<string, mixed>
     */
    protected function mergeGenerationResults(array $left, array $right): array
    {
        $generated = array_merge($left['generated'], $right['generated']);
        $updated = array_merge($left['updated'], $right['updated']);
        $skipped = array_merge($left['skipped'], $right['skipped']);

        return [
            'generated' => $generated,
            'updated' => $updated,
            'skipped' => $skipped,
            'summary' => [
                'generated_count' => count($generated),
                'updated_count' => count($updated),
                'skipped_count' => count($skipped),
                'cadence_period_invoices_created' => ($left['summary']['cadence_period_invoices_created'] ?? 0) +
                    ($right['summary']['cadence_period_invoices_created'] ?? 0),
                'interim_invoices_created' => ($left['summary']['interim_invoices_created'] ?? 0) +
                    ($right['summary']['interim_invoices_created'] ?? 0),
            ],
        ];
    }

    /**
     * Remove generated lines from a draft invoice before regeneration.
     */
    protected function resetSystemGeneratedLines(ClientInvoice $invoice): void
    {
        $systemLines = $invoice->lineItems()
            ->whereIn('line_type', InvoiceLineType::systemGeneratedValues())
            ->get();

        foreach ($systemLines as $line) {
            $line->timeEntries()->update(['client_invoice_line_id' => null]);
            $line->tasks()->update(['client_invoice_line_id' => null]);
        }
        $invoice->lineItems()->whereIn('line_type', InvoiceLineType::systemGeneratedValues())->delete();

        $expenseLines = $invoice->lineItems()->where('line_type', InvoiceLineType::Expense->value)->get();
        foreach ($expenseLines as $line) {
            $line->expenses()->update(['client_invoice_line_id' => null]);
        }
        $invoice->lineItems()->where('line_type', InvoiceLineType::Expense->value)->delete();
    }

    /**
     * Add recurring fixed-fee item incidences to a cadence-period invoice.
     */
    protected function addRecurringItemLines(
        ClientInvoice $invoice,
        ClientAgreement $agreement,
        Carbon $periodStart,
        Carbon $periodEnd,
        int &$sortOrder,
    ): void {
        $agreement->loadMissing('recurringItems');

        foreach ($this->recurringItemBiller->linesForCycle($agreement, $periodStart, $periodEnd) as $lineData) {
            $line = $this->recurringItemBiller->buildLine($lineData, $sortOrder++);
            $line->client_invoice_id = $invoice->client_invoice_id;
            $line->save();
        }
    }

    protected function formatPeriodLabel(Carbon $periodStart, Carbon $periodEnd): string
    {
        if ($periodStart->isSameMonth($periodEnd)) {
            return $periodStart->format('Y-m');
        }

        // These comparisons intentionally use semantic Carbon boundaries instead of string dates.
        if ($periodStart->isSameDay($periodStart->copy()->startOfQuarter())
            && $periodEnd->isSameDay($periodStart->copy()->endOfQuarter()->startOfDay())) {
            return $periodStart->format('Y').'-Q'.$periodStart->quarter;
        }

        if ($periodStart->isSameDay($periodStart->copy()->startOfYear())
            && $periodEnd->isSameDay($periodStart->copy()->endOfYear()->startOfDay())) {
            return $periodStart->format('Y');
        }

        return $periodStart->format('Y-m').'..'.$periodEnd->format('Y-m');
    }

    /**
     * Calculate cumulative balance snapshot for the invoice.
     */
    protected function calculateCumulativeBalanceSnapshot(ClientAgreement $agreement, Carbon $periodEnd, array $allBalances): array
    {
        // The retainer month is the month AFTER the work period
        $retainerMonthStart = $periodEnd->copy()->addDay()->startOfMonth();
        $targetMonthKey = $retainerMonthStart->format('Y-m');

        // Find calculator summary for target month
        $summary = null;
        foreach ($allBalances as $b) {
            if ($b->yearMonth === $targetMonthKey) {
                $summary = $b;
                break;
            }
        }

        if (! $summary) {
            return ['unused' => 0, 'negative' => 0];
        }

        // Total hours billed at rate in history (excluding drafts for this exact period)
        $totalBilledOverages = ClientInvoice::where('client_agreement_id', $agreement->id)
            ->whereNotIn('status', ['void'])
            ->where('period_end', '<=', $periodEnd)
            ->sum('hours_billed_at_rate');

        // The calculator only knows about retainer vs worked hours.
        // We need to apply the "debt payoff" from any overage/catch-up billing.
        $rawNegative = $summary->opening->remainingNegativeBalance;
        $rawUnused = $summary->opening->totalAvailable;

        // Apply overage billing to reduce negative balance first, then add to unused pool
        $netNegative = max(0, $rawNegative - $totalBilledOverages);
        $netUnused = $rawUnused;

        if ($totalBilledOverages > $rawNegative) {
            $netUnused += ($totalBilledOverages - $rawNegative);
        }

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
     * Add billable milestone tasks (with milestone_price > 0) to the invoice.
     *
     * Includes all unbilled tasks completed on or before the period end.
     * This handles the case where a task was completed in a prior period where
     * the invoice was already issued/paid — such tasks are carried forward to
     * the next available (draft or new) invoice.
     */
    protected function addBillableMilestoneTasks(
        ClientCompany $company,
        ClientInvoice $invoice,
        Carbon $periodEnd,
        int &$sortOrder
    ): void {
        $tasks = ClientTask::whereHas('project', function ($q) use ($company) {
            $q->where('client_company_id', $company->id);
        })
            ->where('milestone_price', '>', 0)
            ->whereNotNull('completed_at')
            ->whereNull('client_invoice_line_id')
            ->where('completed_at', '<=', $periodEnd->copy()->endOfDay())
            ->orderBy('completed_at')
            ->get();

        foreach ($tasks as $task) {
            $line = ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $invoice->client_agreement_id,
                'description' => 'Milestone: '.$task->name,
                'quantity' => '1',
                'unit_price' => $task->milestone_price,
                'line_total' => $task->milestone_price,
                'line_type' => 'milestone',
                'hours' => null,
                'line_date' => $task->completed_at,
                'sort_order' => $sortOrder++,
            ]);

            // Link task to invoice line
            $task->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
    }

    /**
     * Add a single prior_month_retainer line that covers all deferred time
     * entries that fit in the remaining capacity for this period.
     *
     * The whole-entry invariant (see docs/client-management/deferred-billing.md):
     * each entry is attached directly — TimeEntrySplitter is never involved.
     */
    protected function addDeferredRetainerLine(
        ClientInvoice $invoice,
        ClientAgreement $agreement,
        DeferredAllocationResult $result,
        Carbon $periodEnd,
        int &$sortOrder,
    ): void {
        $hours = $result->hoursBilled;
        $line = ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_agreement_id' => $agreement->id,
            'description' => sprintf(
                'Deferred work items applied to retainer (%s)',
                $this->formatHoursForQuantity($hours),
            ),
            'quantity' => '',
            'unit_price' => 0,
            'line_total' => 0,
            'line_type' => 'prior_month_retainer',
            'hours' => $hours,
            'line_date' => $periodEnd,
            'sort_order' => $sortOrder++,
        ]);

        foreach ($result->billed as $candidate) {
            $candidate->entry->update([
                'client_invoice_line_id' => $line->client_invoice_line_id,
            ]);
        }
    }

    /**
     * Add an additional_hours line that force-bills every outstanding deferred
     * entry at the agreement's hourly rate. Used on termination invoices so
     * the client is never left with unbilled deferred work.
     *
     * @param  Collection<int, ClientTimeEntry>  $entries
     */
    /**
     * @param  Collection<int, ClientTimeEntry>  $entries
     */
    protected function addDeferredTerminationLine(
        ClientInvoice $invoice,
        ClientAgreement $agreement,
        Collection $entries,
        int &$sortOrder,
    ): void {
        $totalMinutes = (int) $entries->sum('minutes_worked');
        if ($totalMinutes <= 0) {
            return;
        }
        $hours = round($totalMinutes / 60, 4);
        $rate = (float) $agreement->hourly_rate;

        $line = ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_agreement_id' => $agreement->id,
            'description' => sprintf(
                'Deferred work items billed on agreement termination (%s @ $%.2f/hr)',
                $this->formatHoursForQuantity($hours),
                $rate,
            ),
            'quantity' => $this->formatHoursForQuantity($hours),
            'unit_price' => $rate,
            'line_total' => round($hours * $rate, 2),
            'line_type' => 'additional_hours',
            'hours' => $hours,
            'line_date' => $invoice->period_end,
            'sort_order' => $sortOrder++,
        ]);

        foreach ($entries as $entry) {
            $entry->update(['client_invoice_line_id' => $line->client_invoice_line_id]);
        }
        // We intentionally do NOT add these hours to `hours_billed_at_rate` —
        // that field tracks the catch-up/overage pool used by the cumulative
        // balance snapshot, which is a different concept. The $ amount is
        // captured by line_total.
    }

    /**
     * Link all time entry fragments to their respective invoice lines, handling splits correctly.
     *
     * @param  array  $fragmentsToLines  Map of line_id => TimeEntryFragment[]
     */
    protected function linkAllFragmentsToLines(array $fragmentsToLines, TimeEntrySplitter $splitter): void
    {
        // Group all fragments by their original time entry ID across all lines
        $entrySplitPlan = [];  // entry_id => [['line_id' => X, 'minutes' => Y], ...]

        foreach ($fragmentsToLines as $lineId => $fragments) {
            foreach ($fragments as $fragment) {
                $entryId = $fragment->originalTimeEntryId;
                if (! isset($entrySplitPlan[$entryId])) {
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
            if (! $entry) {
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
     * @param  TimeEntryFragment[]  $fragments
     */
    protected function linkFragmentsToLine(array $fragments, ClientInvoiceLine $line, TimeEntrySplitter $splitter): void
    {
        // Group fragments by their original time entry ID
        $fragmentsByEntry = [];
        foreach ($fragments as $fragment) {
            $entryId = $fragment->originalTimeEntryId;
            if (! isset($fragmentsByEntry[$entryId])) {
                $fragmentsByEntry[$entryId] = [];
            }
            $fragmentsByEntry[$entryId][] = $fragment;
        }

        // Process each time entry
        foreach ($fragmentsByEntry as $entryId => $entryFragments) {
            $entry = ClientTimeEntry::find($entryId);
            if (! $entry) {
                continue; // Entry was deleted or not found
            }

            // Calculate total minutes needed from this entry for this line
            $totalMinutesNeeded = array_reduce(
                $entryFragments,
                fn ($sum, $frag) => $sum + $frag->minutes,
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
            ->whereNotIn('line_type', ['retainer', 'credit'])
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
     * @param  float  $hours  Decimal hours (e.g., 1.5)
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
