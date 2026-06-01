<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\ProposalStatus;
use App\Mail\ProposalActionMail;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ProposalClientActionsTest extends TestCase
{
    private User $admin;

    private User $member;

    private User $outsider;

    private ClientCompany $company;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow('2026-06-15 10:00:00');
        Mail::fake();

        $this->admin = $this->createAdminUser();
        $this->member = $this->createUser();
        $this->outsider = $this->createUser();

        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Acme Co',
            'slug' => 'acme-co',
        ]);
        $this->company->users()->attach($this->member);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_member_can_reject_and_no_agreement_is_created(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->sent()->create();

        $this->actingAs($this->member)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/reject", [
                'reason' => 'Budget changed.',
            ])
            ->assertOk()
            ->assertJsonPath('proposal.status', ProposalStatus::Rejected->value);

        $proposal->refresh();
        $this->assertSame(ProposalStatus::Rejected, $proposal->status);
        $this->assertSame('Budget changed.', $proposal->client_response_message);
        $this->assertSame($this->member->name, $proposal->response_name);
        $this->assertNull($proposal->agreement_id);
        $this->assertSame(0, ClientAgreement::where('source_proposal_id', $proposal->id)->count());

        $this->assertDatabaseHas('client_company_activity', [
            'client_company_id' => $this->company->id,
            'action' => 'proposal.rejected',
        ]);
        Mail::assertSent(ProposalActionMail::class, fn (ProposalActionMail $mail) => $mail->action === 'rejected');
    }

    public function test_member_can_request_changes(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->sent()->create();

        $this->actingAs($this->member)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/request-changes", [
                'message' => 'Please remove the Webflow add-on.',
            ])
            ->assertOk()
            ->assertJsonPath('proposal.status', ProposalStatus::ChangesRequested->value);

        $this->assertDatabaseHas('client_company_activity', [
            'client_company_id' => $this->company->id,
            'action' => 'proposal.changes_requested',
        ]);
        Mail::assertSent(ProposalActionMail::class, fn (ProposalActionMail $mail) => $mail->action === 'changes_requested');
    }

    public function test_non_member_cannot_act_on_a_proposal(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->sent()->create();

        $this->actingAs($this->outsider)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/reject", [
                'reason' => 'No.',
            ])
            ->assertForbidden();
    }

    public function test_rejecting_an_already_actioned_proposal_returns_422(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->accepted($this->member)->create();

        $this->actingAs($this->member)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/reject", [
                'reason' => 'Too late.',
            ])
            ->assertStatus(422);
    }

    public function test_reject_requires_a_reason(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->sent()->create();

        $this->actingAs($this->member)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/reject", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');
    }
}
