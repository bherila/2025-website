<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\InvoiceKind;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use Carbon\Carbon;
use Tests\TestCase;

class MigrateLegacyCadenceInvoicesCommandTest extends TestCase
{
    private const COMMAND = 'client-management:migrate-legacy-cadence-invoices';

    private function semiAnnualAgreement(ClientCompany $company, string $activeDate, ?string $terminationDate = null): ClientAgreement
    {
        return ClientAgreement::factory()->for($company)->create([
            'agreement_text' => 'Semiannual retainer',
            'billing_cadence' => BillingCadence::SemiAnnual->value,
            'active_date' => Carbon::parse($activeDate),
            'termination_date' => $terminationDate ? Carbon::parse($terminationDate) : null,
            'monthly_retainer_hours' => 0,
            'monthly_retainer_fee' => 0,
            'retainer_hours' => 1,
            'retainer_fee' => 250,
            'hourly_rate' => 350,
            'rollover_months' => 0,
            'catch_up_threshold_hours' => 1,
            'bill_overage_interim' => false,
            'first_cycle_proration' => 'prorate_hours',
        ]);
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function cadenceInvoice(ClientCompany $company, ClientAgreement $agreement, string $start, string $end, array $overrides = []): ClientInvoice
    {
        return ClientInvoice::create(array_merge([
            'client_company_id' => $company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => Carbon::parse($start),
            'period_end' => Carbon::parse($end),
            'cycle_start' => Carbon::parse($start),
            'cycle_end' => Carbon::parse($end),
            'invoice_number' => 'INV-'.substr($start, 0, 7),
            'invoice_total' => 250,
            'retainer_hours_included' => 1,
            'hours_worked' => 0,
            'status' => 'draft',
            'invoice_kind' => InvoiceKind::CadencePeriod->value,
        ], $overrides));
    }

    public function test_dry_run_reports_without_mutating(): void
    {
        $company = ClientCompany::factory()->create(['slug' => 'atlas-imaging']);
        $agreement = $this->semiAnnualAgreement($company, '2026-06-01');
        $paid = $this->cadenceInvoice($company, $agreement, '2026-06-01', '2026-11-30', ['status' => 'issued']);
        $paid->markPaid('2026-06-05');

        $this->artisan(self::COMMAND, ['--company' => 'atlas-imaging'])
            ->assertExitCode(0);

        $paid->refresh();
        $this->assertSame('2026-06-01', $paid->period_start->toDateString(), 'Dry run must not re-key.');
        $this->assertSame('2026-11-30', $paid->period_end->toDateString());
        $this->assertSame('paid', $paid->status);
    }

    public function test_apply_rekeys_paid_invoice_to_prior_work_cycle(): void
    {
        $company = ClientCompany::factory()->create(['slug' => 'atlas-imaging']);
        $agreement = $this->semiAnnualAgreement($company, '2026-06-01');
        $paid = $this->cadenceInvoice($company, $agreement, '2026-06-01', '2026-11-30', [
            'status' => 'issued',
            'invoice_number' => 'ATLA-202611-001',
        ]);
        $paid->markPaid('2026-06-05');

        $this->artisan(self::COMMAND, ['--company' => 'atlas-imaging', '--apply' => true])
            ->assertExitCode(0);

        $paid->refresh();
        // period re-keyed to the prior work cycle; cycle / number / status / total untouched.
        $this->assertSame('2025-12-01', $paid->period_start->toDateString());
        $this->assertSame('2026-05-31', $paid->period_end->toDateString());
        $this->assertSame('2026-06-01', $paid->cycle_start->toDateString());
        $this->assertSame('2026-11-30', $paid->cycle_end->toDateString());
        $this->assertSame('ATLA-202611-001', (string) $paid->invoice_number);
        $this->assertSame('paid', $paid->status);
        $this->assertEquals(250.0, (float) $paid->invoice_total);
    }

    public function test_apply_soft_deletes_void_invoice_and_marks_orphan_entries_non_billable(): void
    {
        $admin = $this->createAdminUser();
        $company = ClientCompany::factory()->create(['slug' => 'nearshore']);
        $project = ClientProject::factory()->for($company)->create();
        $agreement = $this->semiAnnualAgreement($company, '2025-11-01', '2026-05-29');

        $void = $this->cadenceInvoice($company, $agreement, '2025-11-01', '2026-04-30', ['status' => 'issued']);
        $void->void();

        // An unbilled billable entry inside the void invoice's window (an "orphan").
        $orphan = ClientTimeEntry::factory()->for($company)->for($project, 'project')->create([
            'user_id' => $admin->id,
            'creator_user_id' => $admin->id,
            'date_worked' => '2026-01-15',
            'minutes_worked' => 60,
            'is_billable' => true,
            'is_deferred_billing' => false,
            'client_invoice_line_id' => null,
        ]);

        $this->artisan(self::COMMAND, ['--company' => 'nearshore', '--apply' => true])
            ->assertExitCode(0);

        $this->assertSoftDeleted('client_invoices', ['client_invoice_id' => $void->client_invoice_id]);
        $this->assertFalse((bool) $orphan->fresh()->is_billable, 'Orphaned billable entry must be marked non-billable.');
    }

    public function test_apply_is_idempotent(): void
    {
        $company = ClientCompany::factory()->create(['slug' => 'atlas-imaging']);
        $agreement = $this->semiAnnualAgreement($company, '2026-06-01');
        $paid = $this->cadenceInvoice($company, $agreement, '2026-06-01', '2026-11-30', ['status' => 'issued']);
        $paid->markPaid('2026-06-05');

        $this->artisan(self::COMMAND, ['--apply' => true])->assertExitCode(0);
        $rekeyedPeriod = $paid->fresh()->period_start->toDateString();

        // Second run finds nothing left to migrate and changes nothing.
        $this->artisan(self::COMMAND, ['--apply' => true])
            ->expectsOutputToContain('No legacy "period == cycle" cadence invoices found.')
            ->assertExitCode(0);

        $this->assertSame($rekeyedPeriod, $paid->fresh()->period_start->toDateString());
    }

    public function test_current_convention_invoice_is_left_untouched(): void
    {
        $company = ClientCompany::factory()->create(['slug' => 'modern-co']);
        $agreement = $this->semiAnnualAgreement($company, '2026-06-01');
        // Prior-period layout: period (prior cycle) != cycle (billed cycle).
        $current = $this->cadenceInvoice($company, $agreement, '2025-12-01', '2026-05-31', [
            'status' => 'issued',
            'cycle_start' => Carbon::parse('2026-06-01'),
            'cycle_end' => Carbon::parse('2026-11-30'),
        ]);

        $this->artisan(self::COMMAND, ['--apply' => true])
            ->expectsOutputToContain('No legacy "period == cycle" cadence invoices found.')
            ->assertExitCode(0);

        $current->refresh();
        $this->assertSame('2025-12-01', $current->period_start->toDateString());
        $this->assertSame('issued', $current->status);
    }
}
