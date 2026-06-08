<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\ProposalStatus;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProposal;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ProposalHydrationXssTest extends TestCase
{
    private User $member;

    private ClientCompany $company;

    protected function setUp(): void
    {
        parent::setUp();

        Mail::fake();
        $this->withoutVite();

        $this->member = $this->createUser();
        $this->company = ClientCompany::factory()->create([
            'company_name' => 'Hydration Co',
            'slug' => 'hydration-co',
        ]);
        $this->company->users()->attach($this->member);
    }

    public function test_proposal_detail_hydration_escapes_client_response_script_delimiters(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->sent()->create();
        $payload = '</script><script id="poc-xss">window.__proposalXss=1</script>';

        $this->actingAs($this->member)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/reject", [
                'reason' => $payload,
            ])
            ->assertOk()
            ->assertJsonPath('proposal.status', ProposalStatus::Rejected->value);

        $content = $this->actingAs($this->member)
            ->get("/client/portal/{$this->company->slug}/proposal/{$proposal->id}")
            ->assertOk()
            ->getContent();

        $hydrationData = $this->decodeClientPortalHydrationData($content);

        $this->assertSame($payload, $hydrationData['proposal']['client_response_message']);
        $this->assertStringContainsString('\\u003C/script\\u003E', $content);
        $this->assertStringNotContainsString('<script id="poc-xss">', $content);
    }

    public function test_proposal_list_hydration_escapes_client_response_script_delimiters(): void
    {
        $proposal = ClientProposal::factory()->for($this->company)->sent()->create();
        $payload = '</script><script id="poc-xss">window.__proposalXss=1</script>';

        $this->actingAs($this->member)
            ->postJson("/api/client/portal/{$this->company->slug}/proposals/{$proposal->id}/request-changes", [
                'message' => $payload,
            ])
            ->assertOk()
            ->assertJsonPath('proposal.status', ProposalStatus::ChangesRequested->value);

        $content = $this->actingAs($this->member)
            ->get("/client/portal/{$this->company->slug}/proposals")
            ->assertOk()
            ->getContent();

        $hydrationData = $this->decodeClientPortalHydrationData($content);

        $this->assertSame($payload, $hydrationData['proposals'][0]['client_response_message']);
        $this->assertStringContainsString('\\u003C/script\\u003E', $content);
        $this->assertStringNotContainsString('<script id="poc-xss">', $content);
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeClientPortalHydrationData(string $content): array
    {
        preg_match('/<script id="client-portal-initial-data" type="application\/json">\s*(.*?)\s*<\/script>/s', $content, $matches);

        $this->assertArrayHasKey(1, $matches, 'client-portal-initial-data script not found');

        $decoded = json_decode($matches[1], true);

        $this->assertIsArray($decoded);

        return $decoded;
    }
}
