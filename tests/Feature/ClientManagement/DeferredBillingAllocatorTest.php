<?php

namespace Tests\Feature\ClientManagement;

use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
use App\Services\ClientManagement\DeferredBillingAllocator;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * @see docs/client-management/deferred-billing.md
 */
class DeferredBillingAllocatorTest extends TestCase
{
    private ClientInvoicingService $invoicingService;

    private User $admin;

    private ClientCompany $company;

    private ClientAgreement $agreement;

    private ClientProject $project;

    protected function setUp(): void
    {
        parent::setUp();

        $this->invoicingService = app(ClientInvoicingService::class);

        $this->admin = $this->createAdminUser();

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Deferred Co',
            'slug' => 'deferred-co',
        ]);

        $this->project = ClientProject::factory()->for($this->company)->create([
            'name' => 'Primary',
            'slug' => 'primary',
        ]);

        // 10h retainer, $150/hr, rollover 3 months.
        $this->agreement = ClientAgreement::factory()->for($this->company)->create([
            'monthly_retainer_fee' => 1500.00,
            'monthly_retainer_hours' => 10,
            'hourly_rate' => 150.00,
            'active_date' => Carbon::create(2026, 1, 1),
            'termination_date' => null,
            'rollover_months' => 3,
            'catch_up_threshold_hours' => 1.0,
        ]);
    }

    private function entry(int $minutes, string $date, bool $deferred = true, bool $billable = true): ClientTimeEntry
    {
        return ClientTimeEntry::factory()->create([
            'project_id' => $this->project->id,
            'client_company_id' => $this->company->id,
            'user_id' => $this->admin->id,
            'minutes_worked' => $minutes,
            'date_worked' => $date,
            'is_billable' => $billable,
            'is_deferred_billing' => $deferred,
        ]);
    }

    public function test_entry_that_fits_is_billed_in_full_at_zero(): void
    {
        $deferredEntry = $this->entry(120, '2026-01-10'); // 2h deferred, fits in 10h
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );

        $deferredEntry->refresh();
        $this->assertNotNull($deferredEntry->client_invoice_line_id, 'Deferred entry that fits should be linked');

        $deferredLine = $invoice->lineItems
            ->where('line_type', 'prior_month_retainer')
            ->first(fn ($l) => str_contains((string) $l->description, 'Deferred'));
        $this->assertNotNull($deferredLine);
        $this->assertEquals(0.0, (float) $deferredLine->line_total, 'Deferred retainer line is free');
        $this->assertEquals(2.0, (float) $deferredLine->hours);
    }

    public function test_entry_that_does_not_fit_is_never_split(): void
    {
        // Combined capacity = M-1 retainer (10h) + M retainer (10h) = 20h.
        // Fill 18h of it with non-deferred work, leaving 2h.
        $this->entry(minutes: 18 * 60, date: '2026-01-05', deferred: false);
        // A 7h deferred entry can't fit in 2h → it stays skipped (NOT split into 2+5).
        $deferred = $this->entry(7 * 60, '2026-01-10');

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );

        $deferred->refresh();
        $this->assertNull($deferred->client_invoice_line_id, 'Oversized deferred entry must remain unlinked');
        $this->assertEquals(7 * 60, $deferred->minutes_worked, 'Deferred entries are never split');

        $deferredLine = $invoice->lineItems
            ->where('line_type', 'prior_month_retainer')
            ->first(fn ($l) => str_contains((string) $l->description, 'Deferred'));
        $this->assertNull($deferredLine, 'No deferred retainer line when no deferred fits');
    }

    public function test_fifo_ordering_by_date_then_id(): void
    {
        // 20h combined capacity − 14h non-deferred = 6h remaining.
        // Each deferred is 6h: oldest just fits, newest should not.
        $this->entry(minutes: 14 * 60, date: '2026-01-05', deferred: false);
        $first = $this->entry(6 * 60, '2026-01-02');
        $second = $this->entry(6 * 60, '2026-01-20');

        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );

        $first->refresh();
        $second->refresh();
        $this->assertNotNull($first->client_invoice_line_id, 'Earlier entry wins');
        $this->assertNull($second->client_invoice_line_id, 'Later entry waits');
    }

    public function test_skipped_entries_surface_in_to_detailed_array(): void
    {
        $this->entry(minutes: 20 * 60, date: '2026-01-03', deferred: false); // fills combined pool
        $deferred = $this->entry(2 * 60, '2026-01-10');

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );

        $payload = $invoice->toDetailedArray();
        $this->assertArrayHasKey('deferred_pending', $payload);
        $this->assertCount(1, $payload['deferred_pending']);
        $this->assertEquals($deferred->id, $payload['deferred_pending'][0]['id']);
        $this->assertEquals(2.0, $payload['deferred_pending'][0]['hours']);
    }

    public function test_regeneration_re_evaluates_deferred(): void
    {
        // Start with capacity for the deferred entry.
        $deferred = $this->entry(3 * 60, '2026-01-20');
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );
        $deferred->refresh();
        $this->assertNotNull($deferred->client_invoice_line_id, 'Originally fits');

        // Add 18h of non-deferred work and regenerate — now deferred no longer
        // fits (20h combined pool − 18h = 2h remaining, deferred is 3h).
        $this->entry(minutes: 18 * 60, date: '2026-01-05', deferred: false);
        $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );

        $deferred->refresh();
        $this->assertNull($deferred->client_invoice_line_id, 'Deferred is unlinked when capacity shrinks');
    }

    public function test_termination_force_bills_all_deferred_at_hourly_rate(): void
    {
        // Two deferred entries totaling 15h (well over 10h retainer).
        $a = $this->entry(5 * 60, '2026-01-10');
        $b = $this->entry(10 * 60, '2026-02-15');

        // Terminate the agreement at end of Feb.
        $this->agreement->update(['termination_date' => Carbon::create(2026, 2, 28)]);

        // Generate post-termination invoice for March work period. Pass the
        // agreement explicitly since activeAgreement() returns null after termination.
        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 3, 1),
            Carbon::create(2026, 3, 31),
            $this->agreement->fresh(),
        );

        $deferredLine = $invoice->lineItems
            ->where('line_type', 'additional_hours')
            ->first(fn ($l) => str_contains((string) $l->description, 'termination'));
        $this->assertNotNull($deferredLine, 'Termination invoice has a deferred additional_hours line');
        $this->assertEquals(15.0, (float) $deferredLine->hours);
        $this->assertEquals(15 * 150, (float) $deferredLine->line_total);

        $a->refresh();
        $b->refresh();
        $this->assertNotNull($a->client_invoice_line_id);
        $this->assertNotNull($b->client_invoice_line_id);
    }

    public function test_non_billable_deferred_is_ignored(): void
    {
        $this->entry(120, '2026-01-10', deferred: true, billable: false);

        $invoice = $this->invoicingService->generateInvoice(
            $this->company,
            Carbon::create(2026, 1, 1),
            Carbon::create(2026, 1, 31),
        );

        $deferredLine = $invoice->lineItems
            ->where('line_type', 'prior_month_retainer')
            ->first(fn ($l) => str_contains((string) $l->description, 'Deferred'));
        $this->assertNull($deferredLine, 'Non-billable entries are never billed even if flagged deferred');
    }

    public function test_allocator_unit_skipped_summary_shape(): void
    {
        $deferred = $this->entry(5 * 60, '2026-01-02');
        $result = (new DeferredBillingAllocator)->allocate(
            $this->company,
            Carbon::create(2026, 1, 31),
            remainingCapacityHours: 0.0,
        );

        $this->assertCount(1, $result->skipped);
        $this->assertEquals(
            ['id', 'hours', 'date_worked', 'name'],
            array_keys($result->skipped[0]),
        );
        $this->assertEquals($deferred->id, $result->skipped[0]['id']);
    }
}
