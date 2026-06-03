<?php

namespace App\Console\Commands\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientTimeEntry;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

#[Signature('client-management:migrate-legacy-cadence-invoices
    {--company= : Limit to one client company (id or slug).}
    {--agreement= : Limit to one client agreement id.}
    {--apply : Write changes. Without this flag the command is a read-only dry run.}
    {--format=table : Output format: table or json.}')]
#[Description('Migrate legacy "period == cycle" cadence invoices to the prior-period layout: re-key issued/paid rows so period_* points at the prior work cycle, and soft-delete void rows (marking any orphaned billable entries non-billable).')]
class MigrateLegacyCadenceInvoicesCommand extends BaseClientManagementCommand
{
    public function handle(): int
    {
        $format = (string) $this->option('format');
        if (! in_array($format, ['table', 'json'], true)) {
            $this->error("Invalid --format value '{$format}'. Use 'table' or 'json'.");

            return self::FAILURE;
        }

        $query = $this->legacyInvoiceQuery();
        if ($query === false) {
            return self::FAILURE;
        }

        $apply = (bool) $this->option('apply');
        $rows = [];

        foreach ($query->get() as $invoice) {
            // Defensive: legacy "period == cycle" only ever applies to non-monthly
            // cadence invoices (monthly stores period = M-1 != cycle = M).
            if ($invoice->agreement?->effectiveBillingCadence() === BillingCadence::Monthly) {
                continue;
            }

            $plan = $this->buildPlan($invoice);

            if ($apply) {
                DB::transaction(fn () => $this->applyPlan($invoice, $plan));
            }

            $rows[] = $plan;
        }

        return $this->render($rows, $apply, $format);
    }

    /**
     * @return Builder<ClientInvoice>|false
     */
    private function legacyInvoiceQuery(): Builder|false
    {
        $query = ClientInvoice::query()
            ->with('agreement')
            ->where('invoice_kind', InvoiceKind::CadencePeriod->value)
            ->whereNotNull('cycle_start')
            ->whereNotNull('cycle_end')
            ->whereColumn('period_start', 'cycle_start')
            ->whereColumn('period_end', 'cycle_end')
            ->orderBy('client_invoice_id');

        $companyRef = $this->option('company');
        if ($companyRef !== null && $companyRef !== '') {
            $company = $this->resolveCompany((string) $companyRef);
            if (! $company) {
                return false;
            }
            $query->where('client_company_id', $company->id);
        }

        $agreementRef = $this->option('agreement');
        if ($agreementRef !== null && $agreementRef !== '') {
            $query->where('client_agreement_id', (int) $agreementRef);
        }

        return $query;
    }

    /**
     * @return array<string, mixed>
     */
    private function buildPlan(ClientInvoice $invoice): array
    {
        $base = [
            'invoice_id' => $invoice->client_invoice_id,
            'invoice_number' => $invoice->invoice_number,
            'status' => $invoice->status,
        ];

        if ($invoice->status === 'void') {
            $orphanIds = $this->orphanedBillableEntryIds($invoice);

            return $base + [
                'action' => 'delete',
                'detail' => 'soft-delete; mark '.count($orphanIds).' orphaned billable entr'.(count($orphanIds) === 1 ? 'y' : 'ies').' non-billable',
                'orphan_entry_ids' => $orphanIds,
            ];
        }

        // The prior work cycle, mirroring ClientInvoicingService::previousBillingCycle():
        // start = cycle_start - one cadence span, end = cycle_start - 1 day. (Resolver's
        // cycleContaining() rejects pre-active dates, so first-cycle rows are computed here.)
        $monthsInCycle = $invoice->agreement->effectiveBillingCadence()->monthsInCycle();
        $newPeriodStart = $invoice->cycle_start->copy()->subMonths($monthsInCycle)->startOfDay();
        $newPeriodEnd = $invoice->cycle_start->copy()->subDay()->startOfDay();

        return $base + [
            'action' => 'rekey',
            'detail' => 'period '.$invoice->period_start->toDateString().'..'.$invoice->period_end->toDateString().
                ' -> '.$newPeriodStart->toDateString().'..'.$newPeriodEnd->toDateString(),
            'new_period_start' => $newPeriodStart,
            'new_period_end' => $newPeriodEnd,
        ];
    }

    /**
     * @param  array<string, mixed>  $plan
     */
    private function applyPlan(ClientInvoice $invoice, array $plan): void
    {
        if ($plan['action'] === 'delete') {
            if (! empty($plan['orphan_entry_ids'])) {
                ClientTimeEntry::query()
                    ->whereIn('id', $plan['orphan_entry_ids'])
                    ->update(['is_billable' => false]);
            }

            // Soft-delete: recoverable, and excluded from every generation lookup.
            $invoice->delete();

            return;
        }

        // Issued/paid: re-key only the work-period columns. Cycle, number, status,
        // total, and line items are left untouched (the invoice was already settled).
        $invoice->update([
            'period_start' => $plan['new_period_start'],
            'period_end' => $plan['new_period_end'],
        ]);
    }

    /**
     * Unbilled billable time entries inside a void invoice's work window. void()
     * already unlinked them; deleting the invoice makes them eligible for future
     * billing, so they are marked non-billable instead.
     *
     * @return list<int>
     */
    private function orphanedBillableEntryIds(ClientInvoice $invoice): array
    {
        return ClientTimeEntry::query()
            ->where('client_company_id', $invoice->client_company_id)
            ->where('is_billable', true)
            ->whereNull('client_invoice_line_id')
            ->whereBetween('date_worked', [
                $invoice->period_start->toDateString(),
                $invoice->period_end->toDateString(),
            ])
            ->pluck('id')
            ->all();
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function render(array $rows, bool $apply, string $format): int
    {
        $payload = [
            'apply' => $apply,
            'count' => count($rows),
            'rows' => array_map(
                static fn (array $row): array => [
                    'invoice_id' => $row['invoice_id'],
                    'invoice_number' => $row['invoice_number'],
                    'status' => $row['status'],
                    'action' => $row['action'],
                    'detail' => $row['detail'],
                ],
                $rows,
            ),
        ];

        if ($format === 'json') {
            $this->outputJson($payload);

            return self::SUCCESS;
        }

        if ($rows === []) {
            $this->info('No legacy "period == cycle" cadence invoices found.');

            return self::SUCCESS;
        }

        $this->table(
            ['Invoice ID', 'Number', 'Status', 'Action', 'Detail'],
            array_map(
                static fn (array $row): array => [
                    $row['invoice_id'],
                    $row['invoice_number'],
                    $row['status'],
                    $row['action'],
                    $row['detail'],
                ],
                $rows,
            ),
        );

        $this->info(($apply ? 'Applied ' : 'Would migrate ').count($rows).' legacy cadence invoice(s).');
        if (! $apply) {
            $this->line('Dry-run mode: no changes written. Re-run with --apply to migrate.');
        }

        return self::SUCCESS;
    }
}
