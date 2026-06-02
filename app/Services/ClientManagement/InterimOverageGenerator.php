<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\DataTransferObjects\BillingCycle;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use Carbon\Carbon;
use Exception;
use Illuminate\Support\Facades\DB;
use LogicException;

class InterimOverageGenerator
{
    public function __construct(
        private readonly AgreementSelector $agreementSelector = new AgreementSelector,
        private readonly BillingCycleResolver $billingCycleResolver = new BillingCycleResolver,
        private readonly InvoiceLedgerBuilder $invoiceLedgerBuilder = new InvoiceLedgerBuilder,
        private readonly InvoiceLineComposer $invoiceLineComposer = new InvoiceLineComposer,
        private readonly InvoiceNumberGenerator $invoiceNumberGenerator = new InvoiceNumberGenerator,
    ) {}

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
        $agreement = $agreement ?? $this->agreementSelector->agreementCoveringDate($company, $periodStart);

        if (! $agreement) {
            throw new Exception('No agreement found for this interim overage period.');
        }

        if ($agreement->effectiveBillingCadence() === BillingCadence::Monthly) {
            throw new Exception('Interim overage invoices only apply to non-monthly billing cadences.');
        }

        if (! (bool) $agreement->bill_overage_interim) {
            return null;
        }

        $activeDate = Carbon::parse($agreement->active_date)->startOfDay();
        $terminationDate = $agreement->termination_date
            ? Carbon::parse($agreement->termination_date)->startOfDay()
            : null;

        $cycleProbe = $periodStart->lt($activeDate) ? $activeDate->copy() : $periodStart->copy();
        $cycle = $this->billingCycleResolver->cycleContaining($agreement, $cycleProbe);

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
                throw new Exception("A cadence invoice (#{$issuedCycleInvoice->invoice_number}) already exists for this cycle.");
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
                throw new Exception("An issued interim invoice (#{$existingInvoice->invoice_number}) already exists for this period and cannot be modified.");
            }

            $immediateLedger ??= $this->invoiceLedgerBuilder->buildAgreementLedgerThrough($company, $agreement, $periodEnd, true);
            $this->assertImmediateLedgerSupportsInterimOverage($agreement, $immediateLedger, $cycle, $periodEnd);
            $cumulativeExcessHours = $this->cumulativeInterimExcessHoursThrough($agreement, $immediateLedger, $cycle, $periodEnd);
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
                $this->invoiceLineComposer->resetSystemGeneratedLines($invoice);
            } else {
                $invoice = ClientInvoice::create([
                    'client_company_id' => $company->id,
                    'client_agreement_id' => $agreement->id,
                    'period_start' => $periodStart,
                    'period_end' => $periodEnd,
                    'invoice_number' => $this->invoiceNumberGenerator->generate($company, $periodEnd),
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

            $this->invoiceLineComposer->linkAllFragmentsToLines([
                $line->client_invoice_line_id => $billableFragments,
            ], $splitter);

            $monthSummary = $this->invoiceLedgerBuilder->findLedgerMonth($immediateLedger, $periodEnd->format('Y-m'), $cycle->start->format('Y-m-d'));
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

            (new InvoiceActivityLogger)->recordGenerated($company, $invoice);

            return $invoice->fresh(['lineItems']);
        });
    }

    /**
     * Generate missing interim overage invoices for completed month boundaries inside a cycle.
     *
     * @param  array<int, MonthSummary>|null  $immediateLedger
     * @return array{generated: list<array<string, mixed>>, updated: list<array<string, mixed>>}
     */
    public function ensureInterimOveragesForCycle(
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

    public function interimOverageHoursForCycle(ClientAgreement $agreement, BillingCycle $cycle): float
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
     * @param  array<int, MonthSummary>  $immediateLedger  Ledger built with billExcessImmediately=true so closing excessHours contains billable interim overage.
     */
    private function assertImmediateLedgerSupportsInterimOverage(ClientAgreement $agreement, array $immediateLedger, BillingCycle $cycle, Carbon $periodEnd): void
    {
        $cycleMonthStart = $this->invoiceLedgerBuilder->cycleMonthStartForLegacyMonthlyLedger($agreement, $cycle);
        $periodMonthEnd = $this->invoiceLedgerBuilder->cycleMonthEndForLegacyMonthlyLedger($agreement, $cycle, $periodEnd);
        $cycleStartKey = $cycle->start->format('Y-m-d');

        foreach ($immediateLedger as $summary) {
            if (! $this->invoiceLedgerBuilder->ledgerRowBelongsToCycleThrough($summary, $cycleStartKey, $cycleMonthStart, $periodMonthEnd)) {
                continue;
            }

            if (! $summary->billExcessImmediately) {
                throw new LogicException('Interim overage invoices require a ledger built with billExcessImmediately=true.');
            }
        }
    }

    /**
     * @param  array<int, MonthSummary>  $immediateLedger  Ledger built with billExcessImmediately=true so closing excessHours contains billable interim overage.
     */
    private function cumulativeInterimExcessHoursThrough(ClientAgreement $agreement, array $immediateLedger, BillingCycle $cycle, Carbon $periodEnd): float
    {
        $cycleMonthStart = $this->invoiceLedgerBuilder->cycleMonthStartForLegacyMonthlyLedger($agreement, $cycle);
        $periodMonthEnd = $this->invoiceLedgerBuilder->cycleMonthEndForLegacyMonthlyLedger($agreement, $cycle, $periodEnd);
        $cycleStartKey = $cycle->start->format('Y-m-d');

        return round((float) collect($immediateLedger)
            ->filter(fn (MonthSummary $summary): bool => $this->invoiceLedgerBuilder->ledgerRowBelongsToCycleThrough(
                $summary,
                $cycleStartKey,
                $cycleMonthStart,
                $periodMonthEnd,
            ))
            ->sum(fn (MonthSummary $summary): float => $summary->closing->excessHours), 4);
    }

    private function formatPeriodLabel(Carbon $periodStart, Carbon $periodEnd): string
    {
        if ($periodStart->isSameMonth($periodEnd)) {
            return $periodStart->format('Y-m');
        }

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

    private function formatHoursForQuantity(float $hours): string
    {
        $totalMinutes = (int) round($hours * 60);
        $h = intdiv($totalMinutes, 60);
        $m = $totalMinutes % 60;

        return sprintf('%d:%02d', $h, $m);
    }
}
