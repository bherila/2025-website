<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Enums\ClientManagement\InvoiceKind;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Enums\ClientManagement\ProposalItemKind;
use App\Enums\ClientManagement\ProposalStatus;
use App\Mail\ProposalActionMail;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Models\User;
use App\Services\ClientManagement\ProposalService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ProposalAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-06-15 10:00:00');
        Mail::fake();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeSentProposal(ClientCompany $company): ClientProposal
    {
        $proposal = ClientProposal::factory()
            ->for($company)
            ->sent()
            ->withRetainer(275, 6, 1, 150)
            ->create([
                'title' => 'Scheduling Form Rebuild',
                'base_amount' => 2000,
                'base_description' => 'Cost for the above',
                'credit_amount' => 262.50,
                'credit_label' => 'Less retainer already paid',
                'payment_net_days' => 30,
            ]);

        $proposal->items()->create(['kind' => ProposalItemKind::AddOn->value, 'description' => 'SEO setup', 'amount' => 375, 'charge_cadence' => ChargeCadence::OneTime->value, 'is_optional' => false, 'sort_order' => 0]);
        $proposal->items()->create(['kind' => ProposalItemKind::AddOn->value, 'description' => 'Analytics', 'amount' => 500, 'charge_cadence' => ChargeCadence::OneTime->value, 'is_optional' => true, 'sort_order' => 1]);
        $proposal->items()->create(['kind' => ProposalItemKind::Scope->value, 'description' => 'Homepage', 'amount' => null, 'is_optional' => false, 'sort_order' => 2]);
        $proposal->items()->create(['kind' => ProposalItemKind::Scope->value, 'description' => 'Blog module', 'amount' => null, 'is_optional' => true, 'sort_order' => 3]);

        return $proposal->fresh('items');
    }

    public function test_accept_materializes_agreement_invoice_project_and_tasks(): void
    {
        $company = ClientCompany::factory()->create(['company_name' => 'Acme Clinic']);
        $user = User::factory()->create();
        $proposal = $this->makeSentProposal($company);

        $result = app(ProposalService::class)->accept($proposal, $user, [], 'Carl Smith', 'Owner');

        // Agreement: signed, retainer starts 1st of month following acceptance.
        $agreement = $result['agreement'];
        $this->assertSame('2026-07-01', $agreement->active_date->toDateString());
        $this->assertNotNull($agreement->client_company_signed_date);
        $this->assertSame('Carl Smith', $agreement->client_company_signed_name);
        $this->assertSame($proposal->id, $agreement->source_proposal_id);
        $this->assertSame(BillingCadence::SemiAnnual, $agreement->effectiveBillingCadence());
        $this->assertEqualsWithDelta(275.0, (float) $agreement->retainer_fee, 0.001);
        $this->assertEqualsWithDelta(1.0, (float) $agreement->retainer_hours, 0.001);
        $this->assertEqualsWithDelta(150.0, (float) $agreement->hourly_rate, 0.001);
        $this->assertSame(FirstCycleProration::FullPeriod, $agreement->effectiveFirstCycleProration());
        $this->assertEqualsWithDelta(275.0, $agreement->periodRetainerFee(), 0.001);

        // Invoice: draft ad-hoc, base + mandatory add-on - credit, due net 30.
        $invoice = $result['invoice'];
        $this->assertSame('draft', $invoice->status);
        $this->assertSame(InvoiceKind::AdHoc->value, $invoice->invoiceKindValue());
        $this->assertSame('2026-07-15', $invoice->due_date->toDateString());
        $this->assertEqualsWithDelta(2112.50, (float) $invoice->invoice_total, 0.001);
        $lines = $invoice->lineItems()->orderBy('sort_order')->get();
        $this->assertCount(3, $lines);
        $this->assertSame(InvoiceLineType::Credit->value, $lines->last()->line_type);
        $this->assertEqualsWithDelta(-262.50, (float) $lines->last()->line_total, 0.001);

        // Project + tasks (only mandatory scope item becomes a task).
        $project = $result['project'];
        $this->assertSame('Scheduling Form Rebuild', $project->name);
        $this->assertCount(1, $result['tasks']);
        $this->assertSame('Homepage', $result['tasks'][0]->name);

        // Proposal captured acceptance + links.
        $proposal->refresh();
        $this->assertSame(ProposalStatus::Accepted, $proposal->status);
        $this->assertSame($agreement->id, $proposal->agreement_id);
        $this->assertSame($project->id, $proposal->project_id);

        Mail::assertSent(ProposalActionMail::class, fn (ProposalActionMail $mail): bool => $mail->hasTo('ben@herila.net') && $mail->action === 'accepted');
    }

    public function test_optional_selection_changes_total_and_tasks(): void
    {
        $company = ClientCompany::factory()->create();
        $user = User::factory()->create();
        $proposal = $this->makeSentProposal($company);
        $analytics = $proposal->items->firstWhere('description', 'Analytics');
        $blog = $proposal->items->firstWhere('description', 'Blog module');

        $result = app(ProposalService::class)->accept($proposal, $user, [$analytics->id, $blog->id], 'Carl', 'Owner');

        // base 2000 + SEO 375 + Analytics 500 - credit 262.50
        $this->assertEqualsWithDelta(2612.50, (float) $result['invoice']->invoice_total, 0.001);
        $this->assertCount(2, $result['tasks']);
    }

    public function test_accept_without_retainer_creates_no_retainer_terms(): void
    {
        $company = ClientCompany::factory()->create();
        $user = User::factory()->create();
        $proposal = ClientProposal::factory()->for($company)->sent()->create([
            'base_amount' => 1500,
            'credit_amount' => null,
        ]);

        $result = app(ProposalService::class)->accept($proposal, $user, [], 'Dana', 'CFO');

        $this->assertEqualsWithDelta(0.0, (float) $result['agreement']->monthly_retainer_fee, 0.001);
        $this->assertEqualsWithDelta(1500.0, (float) $result['invoice']->invoice_total, 0.001);
        $this->assertCount(1, $result['invoice']->lineItems()->get());
    }
}
