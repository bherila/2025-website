<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\ProposalStatus;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Models\User;
use App\Services\ClientManagement\ProposalService;
use Tests\TestCase;

class ProposalRevisionTest extends TestCase
{
    private User $admin;

    private ClientCompany $company;

    private ProposalService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = $this->createAdminUser();
        $this->company = ClientCompany::factory()->create(['slug' => 'rev-co']);
        $this->service = app(ProposalService::class);
    }

    public function test_create_revision_increments_version_and_copies_items(): void
    {
        $original = ClientProposal::factory()->for($this->company)->sent()->create(['title' => 'Build v1']);
        $original->items()->create([
            'kind' => 'add_on',
            'description' => 'SEO setup',
            'amount' => 375,
            'charge_cadence' => 'one_time',
            'is_optional' => true,
            'is_selected' => true,
            'sort_order' => 0,
        ]);

        $revision = $this->service->createRevision($original->fresh('items'), $this->admin);

        $this->assertSame($original->version + 1, $revision->version);
        $this->assertSame($original->id, $revision->previous_version_id);
        $this->assertSame($original->root_id ?? $original->id, $revision->root_id);
        $this->assertSame(ProposalStatus::Draft, $revision->status);
        $this->assertSame('Build v1', $revision->title);

        $this->assertCount(1, $revision->items);
        $copied = $revision->items->first();
        $this->assertSame('SEO setup', $copied->description);
        $this->assertFalse((bool) $copied->is_selected, 'Selection must reset on a new revision');
    }

    public function test_revision_chain_shares_a_root_id(): void
    {
        $v1 = ClientProposal::factory()->for($this->company)->sent()->create();
        $v2 = $this->service->createRevision($v1->fresh('items'), $this->admin);
        $v2->update(['status' => ProposalStatus::Sent]);
        $v3 = $this->service->createRevision($v2->fresh('items'), $this->admin);

        $rootId = $v1->id;
        $this->assertSame($rootId, $v1->fresh()->root_id);
        $this->assertSame($rootId, $v2->root_id);
        $this->assertSame($rootId, $v3->root_id);
        $this->assertSame(3, $v3->version);
        $this->assertSame(3, ClientProposal::where('root_id', $rootId)->count());
    }

    public function test_only_the_latest_version_is_pending(): void
    {
        $v1 = ClientProposal::factory()->for($this->company)->sent()->create();
        $this->service->createRevision($v1->fresh('items'), $this->admin);

        $this->assertFalse($v1->fresh()->isPending(), 'A superseded version is no longer pending');
    }

    public function test_sending_a_revision_hides_prior_versions_from_the_client(): void
    {
        $v1 = ClientProposal::factory()->for($this->company)->sent()->create();
        $v2 = $this->service->createRevision($v1->fresh('items'), $this->admin);

        $this->service->send($v2, $this->admin);

        $this->assertFalse((bool) $v1->fresh()->is_visible_to_client, 'The superseded version must be hidden from the client');
        $this->assertTrue((bool) $v2->fresh()->is_visible_to_client, 'The latest sent version stays visible');
    }
}
