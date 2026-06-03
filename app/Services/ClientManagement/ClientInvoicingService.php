<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientExpense;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\DataTransferObjects\BillingCycle;
use App\Services\ClientManagement\DataTransferObjects\ClosingBalance;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use App\Services\ClientManagement\DataTransferObjects\OpeningBalance;
use App\Services\ClientManagement\DataTransferObjects\TimeEntryFragment;
use App\Support\ClientManagement\BillingCadenceLabel;
use Carbon\Carbon;
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

    protected InvoiceNumberGenerator $invoiceNumberGenerator;

    protected AgreementSelector $agreementSelector;

    protected RetainerCalculator $retainerCalculator;

    protected InvoiceLedgerBuilder $invoiceLedgerBuilder;

    protected InvoiceLineComposer $invoiceLineComposer;

    protected InterimOverageGenerator $interimOverageGenerator;

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
        ?InvoiceNumberGenerator $invoiceNumberGenerator = null,
        ?AgreementSelector $agreementSelector = null,
        ?RetainerCalculator $retainerCalculator = null,
        ?InvoiceLedgerBuilder $invoiceLedgerBuilder = null,
        ?InvoiceLineComposer $invoiceLineComposer = null,
        ?InterimOverageGenerator $interimOverageGenerator = null,
    ) {
        $this->rolloverCalculator = $rolloverCalculator ?? new RolloverCalculator;
        $this->billingCycleResolver = $billingCycleResolver ?? new BillingCycleResolver;
        $this->recurringItemBiller = $recurringItemBiller ?? new RecurringItemBiller;
        $this->invoiceNumberGenerator = $invoiceNumberGenerator ?? new InvoiceNumberGenerator;
        $this->agreementSelector = $agreementSelector ?? new AgreementSelector;
        $this->retainerCalculator = $retainerCalculator ?? new RetainerCalculator($this->billingCycleResolver);
        $this->invoiceLedgerBuilder = $invoiceLedgerBuilder
            ?? new InvoiceLedgerBuilder($this->rolloverCalculator, $this->billingCycleResolver, $this->retainerCalculator);
        $this->invoiceLineComposer = $invoiceLineComposer ?? new InvoiceLineComposer($this->recurringItemBiller);
        $this->interimOverageGenerator = $interimOverageGenerator
            ?? new InterimOverageGenerator(
                $this->agreementSelector,
                $this->billingCycleResolver,
                $this->invoiceLedgerBuilder,
                $this->invoiceLineComposer,
                $this->invoiceNumberGenerator,
            );
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
        $agreements = $this->agreementSelector->agreementsForInvoiceGeneration($company);

        foreach ($agreements as $agreement) {
            $successorAgreement = $this->agreementSelector->successorAgreementForGeneration($agreements, $agreement);
            $agreementResults = $this->generateAllInvoicesForAgreement($company, $agreement, $successorAgreement);

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
        $agreement = $this->agreementSelector->agreementForInvoiceGeneration($company);

        if ($agreement->effectiveBillingCadence() !== BillingCadence::Monthly) {
            throw new \Exception('generateAllMonthlyInvoices only supports monthly agreements. Use generateAllInvoices for cadence-aware generation.');
        }

        return $this->generateAllInvoicesForAgreement($company, $agreement);
    }

    /**
     * Generate invoices for one agreement segment by walking retainer periods.
     *
     * Monthly agreements are treated as one-month cadence periods: the invoice
     * period reconciles the previous work month and the cycle fields identify
     * the retainer month billed in advance.
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
    protected function generateAllInvoicesForAgreement(
        ClientCompany $company,
        ClientAgreement $agreement,
        ?ClientAgreement $successorAgreement = null,
    ): array {
        $generated = [];
        $updated = [];
        $skipped = [];
        $through = $this->retainerGenerationThroughDate($agreement, $successorAgreement);
        $billExcessImmediately = $agreement->effectiveBillingCadence() !== BillingCadence::Monthly
            && (bool) $agreement->bill_overage_interim;
        $ledger = $this->invoiceLedgerBuilder->buildAgreementLedgerThrough(
            $company,
            $agreement,
            $through,
            $billExcessImmediately,
        );
        $immediateLedger = $billExcessImmediately ? $ledger : null;

        $monthsWithUnbilledPostTermination = null;

        foreach ($this->retainerPeriodsThrough($agreement, $through) as $retainerPeriod) {
            $workCycle = $this->previousBillingCycle($agreement, $retainerPeriod);
            $existingInvoice = $this->findGeneratedInvoiceForWorkCycle($company, $agreement, $workCycle);
            $periodLabel = $this->generationPeriodLabel($agreement, $workCycle, $retainerPeriod);

            if ($this->shouldSkipEmptyPostTerminationWorkCycle(
                $company,
                $agreement,
                $workCycle,
                $existingInvoice,
                $monthsWithUnbilledPostTermination,
            )) {
                continue;
            }

            if ($agreement->effectiveBillingCadence() !== BillingCadence::Monthly
                && $workCycle->end->gte(Carbon::parse($agreement->active_date)->startOfDay())) {
                $interimResults = $this->ensureInterimOveragesForCycle($company, $agreement, $workCycle, $immediateLedger);
                foreach ($interimResults['generated'] as $result) {
                    $generated[] = $result;
                }
                foreach ($interimResults['updated'] as $result) {
                    $updated[] = $result;
                }
            }

            if ($existingInvoice && in_array($existingInvoice->status, ['issued', 'paid', 'void'], true)) {
                $skipped[] = [
                    'period' => $periodLabel,
                    'invoice_id' => $existingInvoice->client_invoice_id,
                    'status' => $existingInvoice->status,
                    'reason' => 'Invoice already exists with status: '.$existingInvoice->status,
                ];

                continue;
            }

            // Guard against re-billing a retainer period that already has an invoice.
            // Legacy invoices store the billed cycle in period_start/period_end
            // ("period == cycle"), which the prior-cycle work lookup above does not
            // match, so detect them by cycle_start/cycle_end. Issued and paid invoices
            // must not be duplicated; void invoices are also honored so that deliberately
            // voided (waived) cycles are not regenerated.
            $existingForRetainer = $this->findExistingInvoiceForRetainerPeriod($company, $agreement, $retainerPeriod);
            if ($existingForRetainer
                && (! $existingInvoice || $existingInvoice->client_invoice_id !== $existingForRetainer->client_invoice_id)) {
                $skipped[] = [
                    'period' => $periodLabel,
                    'invoice_id' => $existingForRetainer->client_invoice_id,
                    'status' => $existingForRetainer->status,
                    'reason' => 'Retainer period already has an invoice with status: '.$existingForRetainer->status,
                ];

                continue;
            }

            try {
                $invoice = $this->generateInvoiceForPeriod(
                    $company,
                    $agreement,
                    $retainerPeriod,
                    false,
                    $ledger,
                    $immediateLedger,
                );
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
        if (! $agreement) {
            $agreement = $company->activeAgreement();
            if (! $agreement) {
                throw new \Exception('No active agreement found for this client company.');
            }
        }

        $workCycle = $this->billingCycleResolver->cycleContaining($agreement, $periodStart);
        if ($agreement->effectiveBillingCadence() !== BillingCadence::Monthly) {
            if (! $periodStart->isSameDay($workCycle->start) || ! $periodEnd->isSameDay($workCycle->end)) {
                throw new \Exception(
                    'Manual invoices inside an active '.$agreement->effectiveBillingCadence()->value.
                    ' billing cycle are not supported. Generate the full cadence cycle instead.'
                );
            }
        } elseif (! $periodStart->isSameDay($workCycle->start) || ! $periodEnd->isSameDay($workCycle->end)) {
            return $this->generateMonthlyInvoiceForWorkPeriod($company, $periodStart, $periodEnd, $agreement);
        }

        return $this->generateInvoiceForPeriod(
            $company,
            $agreement,
            $this->nextBillingCycle($agreement, $workCycle),
        );
    }

    /**
     * Generate or refresh the invoice that reconciles the period before
     * `$retainerPeriod` and bills `$retainerPeriod` in advance.
     *
     * @param  array<int, MonthSummary>|null  $ledger
     * @param  array<int, MonthSummary>|null  $immediateLedger
     */
    protected function generateInvoiceForPeriod(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $retainerPeriod,
        bool $generateMissingInterims = true,
        ?array $ledger = null,
        ?array $immediateLedger = null,
    ): ClientInvoice {
        $workCycle = $this->previousBillingCycle($agreement, $retainerPeriod);

        if ($agreement->effectiveBillingCadence() === BillingCadence::Monthly) {
            return $this->generateMonthlyInvoiceForWorkPeriod(
                $company,
                $workCycle->start->copy()->startOfDay(),
                $workCycle->end->copy()->startOfDay(),
                $agreement,
            );
        }

        return $this->generateNonMonthlyInvoiceForPeriod(
            $company,
            $agreement,
            $retainerPeriod,
            $generateMissingInterims,
            $ledger,
            $immediateLedger,
        );
    }

    /**
     * Generate a monthly cadence invoice for one work period.
     */
    protected function generateMonthlyInvoiceForWorkPeriod(
        ClientCompany $company,
        Carbon $periodStart,
        Carbon $periodEnd,
        ClientAgreement $agreement,
    ): ClientInvoice {
        // Check for an existing invoice for this exact period
        $invoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->where('period_start', $periodStart)
            ->where('period_end', $periodEnd)
            ->whereNotIn('status', ['void'])
            ->first();

        // If invoice exists and is already settled (issued/paid/void), it cannot be changed.
        // Keyed on status, not isIssued(): a draft can be marked paid directly, leaving
        // issue_date null, and such a paid invoice must never be silently rewritten to draft.
        if ($invoice && $invoice->isImmutable()) {
            throw new \Exception("A settled invoice (#{$invoice->invoice_number}) already exists for this period and cannot be modified.");
        }

        // Check for overlapping periods with other invoices for the same company.
        // Ad-hoc invoices are not tied to any agreement cycle and must not block cadence generation.
        $overlappingInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->whereNotIn('status', ['void'])
            ->whereNotIn('invoice_kind', InvoiceKind::cycleGuardExclusions())
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
                'cycle_start' => $retainerMonthStart,
                'cycle_end' => $retainerMonthStart->copy()->endOfMonth()->startOfDay(),
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
                $invoiceData['invoice_number'] = $this->invoiceNumberGenerator->generateForIssueMonth($company, $periodEnd);
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
            $this->invoiceLineComposer->linkAllFragmentsToLines($fragmentsToLines, $splitter);

            // Monthly retainer fee for month M (the month after the work period).
            // Not charged when the agreement was terminated before the retainer month.
            if (! $isRetainerMonthPostTermination) {
                $retainerMonthEnd = $retainerMonthStart->copy()->endOfMonth();
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => BillingCadenceLabel::for($agreement->effectiveBillingCadence())." Retainer ({$agreement->periodRetainerHours()} hours) - ".
                                    $retainerMonthStart->format('M j, Y').' through '.$retainerMonthEnd->format('M j, Y'),
                    'quantity' => '1',
                    'unit_price' => $agreement->periodRetainerFee(),
                    'line_total' => $agreement->periodRetainerFee(),
                    'line_type' => 'retainer',
                    'hours' => $agreement->periodRetainerHours(),
                    'line_date' => $retainerMonthStart,
                    'sort_order' => $sortOrder++,
                ]);
            }

            $this->invoiceLineComposer->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);
            $this->invoiceLineComposer->addBillableMilestoneTasks($company, $invoice, $periodEnd, $sortOrder);
            $this->invoiceLineComposer->addRecurringItemLines(
                $invoice,
                $agreement,
                $retainerMonthStart,
                $retainerMonthStart->copy()->endOfMonth()->startOfDay(),
                $sortOrder,
            );

            // Deferred-billing allocator: never splits, never triggers catch-up.
            // Termination mode force-bills all outstanding deferred entries at hourly rate.
            $deferredAllocator = new DeferredBillingAllocator;
            if ($isRetainerMonthPostTermination) {
                $deferredToBill = $deferredAllocator->collectForTermination($company, $periodEnd);
                if ($deferredToBill->isNotEmpty()) {
                    $this->invoiceLineComposer->addDeferredTerminationLine($invoice, $agreement, $deferredToBill, $sortOrder);
                }
                $this->deferredSkipped = [];
            } else {
                $remainingCapacity =
                    ($priorMonthCapacity - $plan->totalPriorMonthRetainerHours) +
                    ($currentMonthCapacity - $plan->totalCurrentMonthRetainerHours);
                $deferredResult = $deferredAllocator->allocate($company, $periodEnd, $remainingCapacity);
                if ($deferredResult->hasBilled()) {
                    $this->invoiceLineComposer->addDeferredRetainerLine($invoice, $agreement, $deferredResult, $periodEnd, $sortOrder);
                }
                $this->deferredSkipped = $deferredResult->skipped;
            }

            // Apply any rolling overpayment credit AFTER all other lines have been placed.
            (new OverpaymentCreditService)->applyCreditsToDraftInvoice($invoice);

            $invoice->recalculateTotal();
            $this->updateInvoicePeriodFromLineItems($invoice);

            (new InvoiceActivityLogger)->recordGenerated($company, $invoice);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Generate or refresh one non-monthly cadence-period invoice.
     *
     * The invoice reconciles the prior billing cycle while billing the supplied
     * retainer period in advance. `period_start` / `period_end` identify the
     * work-pull period; `cycle_start` / `cycle_end` identify the retainer period.
     *
     * @param  array<int, MonthSummary>|null  $ledger
     * @param  array<int, MonthSummary>|null  $immediateLedger
     */
    protected function generateNonMonthlyInvoiceForPeriod(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $retainerPeriod,
        bool $generateMissingInterims = true,
        ?array $ledger = null,
        ?array $immediateLedger = null,
    ): ClientInvoice {
        $workCycle = $this->previousBillingCycle($agreement, $retainerPeriod);
        $periodStart = $workCycle->start->copy()->startOfDay();
        $periodEnd = $workCycle->end->copy()->startOfDay();
        $retainerStart = $retainerPeriod->start->copy()->startOfDay();
        $retainerEnd = $retainerPeriod->end->copy()->startOfDay();

        return DB::transaction(function () use ($company, $agreement, $workCycle, $retainerPeriod, $periodStart, $periodEnd, $retainerStart, $retainerEnd, $generateMissingInterims, $ledger, $immediateLedger): ClientInvoice {
            // Serialize generation for this agreement; invoice rows below may not exist yet.
            ClientAgreement::query()
                ->whereKey($agreement->getKey())
                ->lockForUpdate()
                ->first();

            if ((bool) $agreement->bill_overage_interim) {
                $ledger ??= $this->invoiceLedgerBuilder->buildAgreementLedgerThrough($company, $agreement, $periodEnd, true);
                $immediateLedger ??= $ledger;
            }

            if ($generateMissingInterims && $workCycle->end->gte(Carbon::parse($agreement->active_date)->startOfDay())) {
                $this->ensureInterimOveragesForCycle($company, $agreement, $workCycle, $immediateLedger);
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

            if ($invoice && $invoice->isImmutable()) {
                throw new \Exception("A settled invoice (#{$invoice->invoice_number}) already exists for this cadence cycle and cannot be modified.");
            }

            $overlappingInvoice = ClientInvoice::query()
                ->where('client_company_id', $company->id)
                ->whereNotIn('status', ['void'])
                ->whereNotIn('invoice_kind', InvoiceKind::cycleGuardExclusions())
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
                    'cycle_start' => $retainerStart,
                    'cycle_end' => $retainerEnd,
                    'invoice_number' => $this->invoiceNumberGenerator->generateForIssueMonth($company, $periodEnd),
                    'invoice_kind' => InvoiceKind::CadencePeriod->value,
                    'status' => 'draft',
                ]);
                $this->invoiceLineComposer->resetSystemGeneratedLines($invoice);
            } else {
                $invoice = ClientInvoice::create([
                    'client_company_id' => $company->id,
                    'client_agreement_id' => $agreement->id,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'invoice_number' => $this->invoiceNumberGenerator->generateForIssueMonth($company, $periodEnd),
                    'invoice_total' => 0,
                    'status' => 'draft',
                    'invoice_kind' => InvoiceKind::CadencePeriod->value,
                    'cycle_start' => $retainerStart,
                    'cycle_end' => $retainerEnd,
                ]);
            }

            $sortOrder = 1;
            $allocationService = new AllocationService;
            $allocationService->recombineUnlinkedFragments($company->id);

            $ledger ??= $this->invoiceLedgerBuilder->buildAgreementLedgerThrough(
                $company,
                $agreement,
                $periodEnd,
                (bool) $agreement->bill_overage_interim,
            );
            $activeDate = Carbon::parse($agreement->active_date)->startOfDay();
            $ledgerWorkCycle = $this->ledgerCycleForWorkCycle($agreement, $workCycle);
            $cycleLedger = $workCycle->end->lt($activeDate)
                ? $this->emptyCycleLedgerSummary()
                : $this->invoiceLedgerBuilder->summarizeLedgerForCycle($agreement, $ledger, $ledgerWorkCycle);
            $interimBilledHours = $workCycle->end->lt($activeDate)
                ? 0.0
                : $this->interimOverageHoursForCycle($agreement, $workCycle);

            $entries = ClientTimeEntry::query()
                ->where('client_company_id', $company->id)
                ->whereNull('client_invoice_line_id')
                ->where('is_billable', true)
                ->where('is_deferred_billing', false)
                ->whereBetween('date_worked', [$periodStart, $periodEnd])
                ->orderBy('date_worked')
                ->orderBy('id')
                ->get();

            $retainerLedgerRows = $this->invoiceLedgerBuilder->buildAgreementLedgerThrough(
                $company,
                $agreement,
                $retainerEnd,
                false,
            );
            $ledgerRetainerPeriod = $this->ledgerCycleForWorkCycle($agreement, $retainerPeriod);
            $retainerLedger = $this->invoiceLedgerBuilder->summarizeLedgerForCycle($agreement, $retainerLedgerRows, $ledgerRetainerPeriod);
            $retainerHours = $this->retainerCalculator->cycleRetainerHours($agreement, $ledgerRetainerPeriod, $retainerLedger);
            $retainerFee = $this->retainerCalculator->cycleRetainerFee($agreement, $ledgerRetainerPeriod, $retainerLedger);

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
                    'description' => 'Work items applied to '.strtolower(BillingCadenceLabel::for($agreement->effectiveBillingCadence()))." retainer ({$this->formatHoursForQuantity($hours)} applied to {$this->formatPeriodLabel($periodStart, $periodEnd)} cycle)",
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

            $this->invoiceLineComposer->linkAllFragmentsToLines($fragmentsToLines, $splitter);

            if ($retainerFee > 0 || $retainerHours > 0) {
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => BillingCadenceLabel::for($agreement->effectiveBillingCadence())." Retainer ({$this->formatHoursForQuantity($retainerHours)} hours) - ".
                                    $retainerStart->format('M j, Y').' through '.$retainerEnd->format('M j, Y'),
                    'quantity' => '1',
                    'unit_price' => $retainerFee,
                    'line_total' => $retainerFee,
                    'line_type' => InvoiceLineType::Retainer->value,
                    'hours' => $retainerHours,
                    'line_date' => $retainerStart,
                    'sort_order' => $sortOrder++,
                ]);
            }

            $this->invoiceLineComposer->addReimbursableExpenses($company, $invoice, $periodEnd, $sortOrder);
            $this->invoiceLineComposer->addBillableMilestoneTasks($company, $invoice, $periodEnd, $sortOrder);
            $this->invoiceLineComposer->addRecurringItemLines($invoice, $agreement, $retainerStart, $retainerEnd, $sortOrder);

            $remainingCapacity = max(0.0, $cycleLedger['covered_hours'] - $plan->totalPriorMonthRetainerHours);
            $deferredResult = (new DeferredBillingAllocator)->allocate($company, $periodEnd, $remainingCapacity);
            if ($deferredResult->hasBilled()) {
                $this->invoiceLineComposer->addDeferredRetainerLine($invoice, $agreement, $deferredResult, $periodEnd, $sortOrder);
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

            (new InvoiceActivityLogger)->recordGenerated($company, $invoice);

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
        return $this->interimOverageGenerator->generateInterimOverageInvoice(
            $company,
            $monthStart,
            $agreement,
            $immediateLedger,
        );
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
        return $this->interimOverageGenerator->ensureInterimOveragesForCycle(
            $company,
            $agreement,
            $cycle,
            $immediateLedger,
        );
    }

    /**
     * Resolve the last retainer date invoice generation should cover.
     */
    protected function retainerGenerationThroughDate(
        ClientAgreement $agreement,
        ?ClientAgreement $successorAgreement = null,
    ): Carbon {
        if ($agreement->effectiveBillingCadence() === BillingCadence::Monthly) {
            $retainerPeriodStart = now()->startOfMonth()->addMonth();
            $terminationDate = $agreement->termination_date
                ? Carbon::parse($agreement->termination_date)->startOfDay()
                : null;

            if ($successorAgreement !== null && $terminationDate !== null) {
                $successorCatchUpStart = Carbon::parse($successorAgreement->active_date)
                    ->startOfMonth()
                    ->subMonth();
                $terminationSegmentEnd = $terminationDate->copy()->startOfMonth()->addMonth();
                $segmentEnd = $successorCatchUpStart->gt($terminationSegmentEnd)
                    ? $successorCatchUpStart
                    : $terminationSegmentEnd;

                if ($segmentEnd->lt($retainerPeriodStart)) {
                    $retainerPeriodStart = $segmentEnd;
                }
            }

            return $retainerPeriodStart->copy()->endOfMonth()->startOfDay();
        }

        $activeDate = Carbon::parse($agreement->active_date)->startOfDay();
        $referenceDate = now()->startOfDay();

        if ($activeDate->gt($referenceDate)) {
            return $this->billingCycleResolver->cycleContaining($agreement, $activeDate)->end;
        }

        if ($agreement->termination_date !== null && Carbon::parse($agreement->termination_date)->lt($referenceDate)) {
            $referenceDate = Carbon::parse($agreement->termination_date)->startOfDay();
        }

        return $this->nextBillingCycle(
            $agreement,
            $this->billingCycleResolver->cycleContaining($agreement, $referenceDate),
        )->end;
    }

    /**
     * @return iterable<BillingCycle>
     */
    protected function retainerPeriodsThrough(ClientAgreement $agreement, Carbon $through): iterable
    {
        $cursor = $this->billingCycleResolver->cycleContaining(
            $agreement,
            Carbon::parse($agreement->active_date)->startOfDay(),
        );

        while ($cursor->start->lte($through)) {
            yield $cursor;
            $cursor = $this->nextBillingCycle($agreement, $cursor);
        }
    }

    protected function findGeneratedInvoiceForWorkCycle(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $workCycle,
    ): ?ClientInvoice {
        return ClientInvoice::query()
            ->where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
            ->whereDate('period_start', $workCycle->start->toDateString())
            ->whereDate('period_end', $workCycle->end->toDateString())
            ->first();
    }

    /**
     * Find an invoice that already covers the supplied retainer period in an
     * issued, paid, or void state. Matches on cycle_start / cycle_end so that legacy
     * "period == cycle" invoices are recognized regardless of the period convention.
     * Void is included so a deliberately voided (waived) cycle is not regenerated.
     */
    protected function findExistingInvoiceForRetainerPeriod(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $retainerPeriod,
    ): ?ClientInvoice {
        return ClientInvoice::query()
            ->where('client_company_id', $company->id)
            ->where('client_agreement_id', $agreement->id)
            ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
            ->whereDate('cycle_start', $retainerPeriod->start->toDateString())
            ->whereDate('cycle_end', $retainerPeriod->end->toDateString())
            ->whereIn('status', ['issued', 'paid', 'void'])
            ->first();
    }

    /**
     * @param  array<string, true>|null  $monthsWithUnbilledPostTermination
     */
    protected function shouldSkipEmptyPostTerminationWorkCycle(
        ClientCompany $company,
        ClientAgreement $agreement,
        BillingCycle $workCycle,
        ?ClientInvoice $existingInvoice,
        ?array &$monthsWithUnbilledPostTermination,
    ): bool {
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)->startOfDay()
            : null;

        if ($terminationDate === null || $existingInvoice !== null || ! $workCycle->start->gt($terminationDate)) {
            return false;
        }

        if ($monthsWithUnbilledPostTermination === null) {
            $workMonths = ClientTimeEntry::query()
                ->where('client_company_id', $company->id)
                ->where('is_billable', true)
                ->whereNull('client_invoice_line_id')
                ->where('date_worked', '>', $terminationDate->toDateString())
                ->pluck('date_worked')
                ->map(fn ($date): string => substr((string) $date, 0, 7))
                ->all();

            $expenseMonths = ClientExpense::query()
                ->where('client_company_id', $company->id)
                ->where('is_reimbursable', true)
                ->whereNull('client_invoice_line_id')
                ->where('expense_date', '>', $terminationDate->toDateString())
                ->pluck('expense_date')
                ->map(fn ($date): string => substr((string) $date, 0, 7))
                ->all();

            $monthsWithUnbilledPostTermination = array_fill_keys(
                array_unique(array_merge($workMonths, $expenseMonths)),
                true,
            );
        }

        $cursor = $workCycle->start->copy()->startOfMonth();
        $endMonth = $workCycle->end->copy()->startOfMonth();
        while ($cursor->lte($endMonth)) {
            if (isset($monthsWithUnbilledPostTermination[$cursor->format('Y-m')])) {
                return false;
            }

            $cursor->addMonth()->startOfMonth();
        }

        return true;
    }

    protected function nextBillingCycle(ClientAgreement $agreement, BillingCycle $cycle): BillingCycle
    {
        $naturalCycle = $this->billingCycleResolver->cycleContaining($agreement, $cycle->start);
        $start = $naturalCycle->end->copy()->addDay()->startOfDay();
        $end = $start->copy()->addMonths($agreement->effectiveBillingCadence()->monthsInCycle())->subDay()->startOfDay();

        return $this->makeBillingCycle($start, $end, false);
    }

    protected function previousBillingCycle(ClientAgreement $agreement, BillingCycle $retainerPeriod): BillingCycle
    {
        $end = $retainerPeriod->start->copy()->subDay()->startOfDay();
        $start = $retainerPeriod->start->copy()
            ->subMonths($agreement->effectiveBillingCadence()->monthsInCycle())
            ->startOfDay();

        return $this->makeBillingCycle($start, $end, false);
    }

    protected function ledgerCycleForWorkCycle(ClientAgreement $agreement, BillingCycle $workCycle): BillingCycle
    {
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)->startOfDay()
            : null;

        if ($terminationDate === null
            || $terminationDate->lt($workCycle->start)
            || $terminationDate->gte($workCycle->end)) {
            return $workCycle;
        }

        return $this->makeBillingCycle($workCycle->start->copy(), $terminationDate, true);
    }

    protected function makeBillingCycle(Carbon $start, Carbon $end, bool $isProrated): BillingCycle
    {
        $monthStarts = [];
        $cursor = $start->copy()->startOfMonth();

        while ($cursor->lte($end)) {
            $monthStarts[] = $cursor->copy();
            $cursor->addMonth()->startOfMonth();
        }

        return new BillingCycle(
            start: $start,
            end: $end,
            isProrated: $isProrated,
            monthCount: count($monthStarts),
            monthStarts: $monthStarts,
        );
    }

    protected function interimOverageHoursForCycle(ClientAgreement $agreement, BillingCycle $cycle): float
    {
        return $this->interimOverageGenerator->interimOverageHoursForCycle($agreement, $cycle);
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
    protected function emptyCycleLedgerSummary(): array
    {
        return [
            'retainer_hours' => 0.0,
            'retainer_multiplier' => 0.0,
            'covered_hours' => 0.0,
            'hours_worked' => 0.0,
            'rollover_hours_used' => 0.0,
            'unused_hours' => 0.0,
            'negative_hours' => 0.0,
            'starting_unused_hours' => 0.0,
            'starting_negative_hours' => 0.0,
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

    protected function generationPeriodLabel(
        ClientAgreement $agreement,
        BillingCycle $workCycle,
        BillingCycle $retainerPeriod,
    ): string {
        $workLabel = $this->formatPeriodLabel($workCycle->start, $workCycle->end);

        if ($agreement->effectiveBillingCadence() === BillingCadence::Monthly) {
            return $workLabel;
        }

        return $workLabel.' -> '.$this->formatPeriodLabel($retainerPeriod->start, $retainerPeriod->end);
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
