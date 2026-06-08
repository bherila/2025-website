<?php

namespace Tests\Feature\ClientManagement;

use App\Enums\ClientManagement\ProposalStatus;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
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

    public function test_index_page_hydration_escapes_company_name_script_delimiters(): void
    {
        $payload = '</script><script id="poc-xss">window.__indexXss=1</script>';

        $this->company->update(['company_name' => $payload]);

        $content = $this->actingAs($this->member)
            ->get("/client/portal/{$this->company->slug}")
            ->assertOk()
            ->getContent();

        $hydrationData = $this->decodeClientPortalHydrationData($content);

        $this->assertSame($payload, $hydrationData['companyName']);
        $this->assertStringContainsString('\\u003C/script\\u003E', $content);
        $this->assertStringNotContainsString('<script id="poc-xss">', $content);
    }

    public function test_project_page_hydration_escapes_project_name_script_delimiters(): void
    {
        $xssName = '</script><script id="poc-xss">window.__projectXss=1</script>';

        $project = ClientProject::factory()->for($this->company)->create([
            'name' => $xssName,
            'slug' => 'xss-project-test',
            'creator_user_id' => $this->member->id,
        ]);

        $content = $this->actingAs($this->member)
            ->get("/client/portal/{$this->company->slug}/project/{$project->slug}")
            ->assertOk()
            ->getContent();

        $hydrationData = $this->decodeClientPortalHydrationData($content);

        $this->assertSame($xssName, $hydrationData['project']['name']);
        $this->assertStringContainsString('\\u003C/script\\u003E', $content);
        $this->assertStringNotContainsString('<script id="poc-xss">', $content);
    }

    /**
     * Structural guard: every portal hydration blade must use JSON_HEX_TAG.
     * This test fails fast if a blade is added or edited to drop the HEX flags,
     * before a browser-based test would catch it.
     */
    public function test_all_portal_hydration_blades_use_hex_tag_flag(): void
    {
        $bladeDir = resource_path('views/client-management/portal');
        $blades = glob($bladeDir.'/*.blade.php');

        $this->assertNotEmpty($blades, 'No portal blade files found');

        foreach ($blades as $blade) {
            $source = file_get_contents($blade);
            $basename = basename($blade);

            // Blades without a hydration <script> block are exempt.
            if (! str_contains($source, 'application/json')) {
                continue;
            }

            $this->assertTrue(
                str_contains($source, '@portalJson(') || str_contains($source, 'JSON_HEX_TAG'),
                "Portal blade {$basename} embeds a hydration <script> block but does not use @portalJson or JSON_HEX_TAG — stored XSS via </script> breakout is possible.",
            );
        }
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
