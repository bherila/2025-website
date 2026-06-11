<?php

namespace Tests\Feature\Agent\Tax;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Http\Controllers\Agent\Tax\AgentTaxController;
use App\Http\Middleware\AuthenticateAgentRequest;
use App\Http\Middleware\NegotiatesAgentPayload;
use App\Mcp\Servers\Tax;
use App\Models\AgentApiToken;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinDocument;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use App\Support\Agent\AgentTokenService;
use HelgeSverre\Toon\Toon;
use Illuminate\Support\Facades\Route;
use Illuminate\Testing\TestResponse;
use Laravel\Mcp\Facades\Mcp;
use Tests\TestCase;

/**
 * Lane 3E (epic #976): local-only CPA return line comparison.
 *
 * POST /api/agent/v1/tax/preview/{year}/compare-return-lines and the
 * /mcp/tax server's tax_compare_return_lines tool. Pure computation — the
 * tests assert zero storage side-effects (no FileForTaxDocument, FinDocument,
 * or GenAiImportJob rows created).
 *
 * The route/MCP registrations below are self-installed when missing because
 * routes/agent.php and routes/ai.php are integrator-owned chokepoints; once
 * the integrator wires them the guards become no-ops.
 */
class CompareReturnLinesTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();

        $this->registerTaxSurfaceIfMissing();
    }

    private function registerTaxSurfaceIfMissing(): void
    {
        if (! Route::has('agent.tax.compare-return-lines')) {
            Route::prefix('api/agent/v1')
                ->name('agent.')
                ->middleware([NegotiatesAgentPayload::class])
                ->group(function (): void {
                    Route::middleware(AuthenticateAgentRequest::class.':tax')->prefix('tax')->name('tax.')->group(function (): void {
                        Route::post('/preview/{year}/compare-return-lines', [AgentTaxController::class, 'compareReturnLines'])
                            ->whereNumber('year')
                            ->middleware('feature:finance.tax-preview.view')
                            ->name('compare-return-lines');
                    });
                });
        }

        $mcpTaxRegistered = collect(Route::getRoutes()->getRoutes())
            ->contains(fn ($route): bool => $route->uri() === 'mcp/tax' && in_array('POST', $route->methods(), true));

        if (! $mcpTaxRegistered) {
            Mcp::web('/mcp/tax', Tax::class)->middleware(AuthenticateAgentRequest::class.':tax');
        }
    }

    /** @return array{user: User, token: string} */
    private function createUserWithTaxToken(array $permissions = ['finance.tax-preview.view']): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, 'tax', null);

        return ['user' => $user, 'token' => $result['token']];
    }

    /** @return array<string, string> */
    private function bearer(string $token): array
    {
        return ['Authorization' => 'Bearer '.$token];
    }

    private function createW2For(User $user, array $parsedData, int $taxYear = 2024): void
    {
        static $sequence = 0;
        $sequence++;

        app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $user->id,
            'tax_year' => $taxYear,
            'form_type' => 'w2',
            'is_reviewed' => true,
            'original_filename' => "w2_{$sequence}.pdf",
            'stored_filename' => "w2_{$sequence}_stored.pdf",
            's3_path' => "tax_docs/{$user->id}/w2_{$sequence}_stored.pdf",
            'file_size_bytes' => 1024,
            'file_hash' => "compare-lines-hash-{$sequence}",
            'uploaded_by_user_id' => $user->id,
            'genai_status' => 'pending',
            'parsed_data' => array_merge(['employer_name' => 'Synthetic Employer Inc'], $parsedData),
        ]);
    }

    private function compare(string $token, array $payload, int $year = 2024): TestResponse
    {
        return $this->postJson(
            "/api/agent/v1/tax/preview/{$year}/compare-return-lines",
            $payload,
            $this->bearer($token),
        );
    }

    // -------------------------------------------------------------------
    // Auth + permission gating
    // -------------------------------------------------------------------

    public function test_requires_token(): void
    {
        $this->postJson('/api/agent/v1/tax/preview/2024/compare-return-lines', [
            'lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => 1]],
        ])->assertStatus(401);
    }

    public function test_returns_403_without_feature_permission(): void
    {
        ['token' => $token] = $this->createUserWithTaxToken(['finance.access']);

        $this->compare($token, ['lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => 1]]])
            ->assertStatus(403);
    }

    public function test_rejects_tokens_scoped_to_other_modules(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['finance.tax-preview.view']);
        $rawToken = 'bha_'.bin2hex(random_bytes(32));

        AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'module' => 'career-comparison',
            'token_hash' => hash('sha256', $rawToken),
            'allowed_permissions' => ['finance.tax-preview.view'],
        ]);

        $this->compare($rawToken, ['lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => 1]]])
            ->assertStatus(401);
    }

    public function test_validates_payload(): void
    {
        ['token' => $token] = $this->createUserWithTaxToken();

        $this->compare($token, ['lines' => []])->assertStatus(422);
        $this->compare($token, [])->assertStatus(422);
        $this->compare($token, ['lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => 'twelve']]])
            ->assertStatus(422)
            ->assertJsonStructure(['message', 'errors']);
    }

    // -------------------------------------------------------------------
    // Comparison behavior
    // -------------------------------------------------------------------

    public function test_compares_return_lines_against_preview_facts(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithTaxToken();
        $this->createW2For($user, ['box1_wages' => 123400, 'box2_fed_tax' => 1000]);

        $response = $this->compare($token, [
            'return_type' => 'cpa_prepared_1040',
            'tolerance_cents' => 100,
            'lines' => [
                ['form' => '1040', 'line' => '1z', 'label' => 'Wages', 'amount_cents' => 12345600],
                ['form' => '1040', 'line' => '25a', 'label' => 'Federal withholding', 'amount_cents' => 100050],
                ['form' => 'Form 9999', 'line' => '1', 'amount_cents' => 1],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertSame(2024, $response->json('year'));
        $this->assertSame('cpa_prepared_1040', $response->json('return_type'));
        $this->assertSame(1, $response->json('summary.matched'));
        $this->assertSame(1, $response->json('summary.different'));
        $this->assertSame(1, $response->json('summary.unmatched_input'));

        $discrepancy = collect($response->json('discrepancies'))->firstWhere('key', 'form_1040_line_1z');
        $this->assertNotNull($discrepancy);
        $this->assertSame('different', $discrepancy['status']);
        $this->assertSame(12345600, $discrepancy['return_amount_cents']);
        $this->assertSame(12340000, $discrepancy['preview_amount_cents']);
        $this->assertSame(5600, $discrepancy['delta_cents']);
        $this->assertSame('review', $discrepancy['severity']);

        $this->assertSame('Form 9999', $response->json('unmatched_inputs.0.form'));
    }

    public function test_line_missing_from_preview_is_reported(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithTaxToken();
        $this->createW2For($user, ['box1_wages' => 1000]);

        $response = $this->compare($token, [
            'lines' => [
                ['form' => '1040', 'line' => '1z', 'amount_cents' => 100000],
                ['form' => 'Schedule B', 'line' => '1', 'amount_cents' => 5000],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertSame(1, $response->json('summary.matched'));
        $this->assertSame(1, $response->json('summary.missing_in_preview'));

        $missing = collect($response->json('discrepancies'))->firstWhere('key', 'schedule_b_line_1');
        $this->assertSame('missing_in_preview', $missing['status']);
        $this->assertNull($missing['preview_amount_cents']);
        $this->assertSame(5000, $missing['delta_cents']);
    }

    public function test_preview_routings_absent_from_input_count_as_missing_in_return(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithTaxToken();
        // box2_fed_tax produces a form_1040_line_25a routing not submitted below.
        $this->createW2For($user, ['box1_wages' => 1000, 'box2_fed_tax' => 200]);

        $response = $this->compare($token, [
            'lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => 100000]],
        ]);

        $response->assertStatus(200);
        $this->assertGreaterThanOrEqual(1, $response->json('summary.missing_in_return'));
        // Summary count only — preview lines are never dumped into the response.
        $keys = collect($response->json('discrepancies'))->pluck('key');
        $this->assertFalse($keys->contains('form_1040_line_25a'));
    }

    // -------------------------------------------------------------------
    // TOON content negotiation
    // -------------------------------------------------------------------

    public function test_accepts_toon_request_and_returns_toon_response(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithTaxToken();
        $this->createW2For($user, ['box1_wages' => 123400]);

        $payload = [
            'tolerance_cents' => 100,
            'lines' => [
                ['form' => '1040', 'line' => '1z', 'label' => 'Wages', 'amount_cents' => 12345600],
            ],
        ];

        $jsonResult = $this->compare($token, $payload)->assertStatus(200)->json();

        $toonResponse = $this->call(
            'POST',
            '/api/agent/v1/tax/preview/2024/compare-return-lines',
            [],
            [],
            [],
            $this->transformHeadersToServerVars(array_merge($this->bearer($token), [
                'Content-Type' => 'text/toon',
                'Accept' => 'text/toon',
            ])),
            Toon::encode($payload),
        );

        $toonResponse->assertStatus(200);
        $this->assertStringStartsWith('text/toon', (string) $toonResponse->headers->get('Content-Type'));

        $decoded = Toon::decode($toonResponse->getContent());
        $this->assertEquals($jsonResult['summary'], $decoded['summary']);
        $this->assertEquals($jsonResult['discrepancies'][0]['delta_cents'], $decoded['discrepancies'][0]['delta_cents']);
    }

    // -------------------------------------------------------------------
    // Zero storage side-effects
    // -------------------------------------------------------------------

    public function test_comparison_has_zero_storage_side_effects(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithTaxToken();
        $this->createW2For($user, ['box1_wages' => 1000]);

        $taxDocCount = FileForTaxDocument::query()->count();
        $finDocCount = FinDocument::query()->count();
        $importJobCount = GenAiImportJob::query()->count();

        $this->compare($token, [
            'return_type' => 'cpa_prepared_1040',
            'lines' => [
                ['form' => '1040', 'line' => '1z', 'amount_cents' => 100000],
                ['form' => 'Schedule B', 'line' => '1', 'amount_cents' => 5000],
            ],
        ])->assertStatus(200);

        $this->assertSame($taxDocCount, FileForTaxDocument::query()->count());
        $this->assertSame($finDocCount, FinDocument::query()->count());
        $this->assertSame($importJobCount, GenAiImportJob::query()->count());
    }

    // -------------------------------------------------------------------
    // MCP server (/mcp/tax)
    // -------------------------------------------------------------------

    private function mcp(string $rawToken, string $method, array $params = []): TestResponse
    {
        return $this->postJson('/mcp/tax', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => $method,
            'params' => $params,
        ], $this->bearer($rawToken));
    }

    public function test_mcp_tools_list_shows_compare_tool_with_permission(): void
    {
        ['token' => $token] = $this->createUserWithTaxToken();

        $response = $this->mcp($token, 'tools/list');
        $response->assertStatus(200);

        $names = collect($response->json('result.tools'))->pluck('name')->all();
        $this->assertContains('tax_compare_return_lines', $names);
        $this->assertContains('get-tax-preview', $names);
    }

    public function test_mcp_tools_list_hides_compare_tool_without_permission(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['finance.access']);
        $raw = bin2hex(random_bytes(32));
        $user->forceFill(['mcp_api_key' => hash('sha256', $raw)])->save();

        $response = $this->mcp($raw, 'tools/list');
        $response->assertStatus(200);

        $names = collect($response->json('result.tools'))->pluck('name')->all();
        $this->assertNotContains('tax_compare_return_lines', $names);
        $this->assertNotContains('get-tax-preview', $names);

        $denied = $this->mcp($raw, 'tools/call', [
            'name' => 'tax_compare_return_lines',
            'arguments' => ['year' => 2024, 'lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => 1]]],
        ]);
        $this->assertStringContainsString('not found', (string) $denied->json('error.message'));
    }

    public function test_mcp_compare_tool_invocation_returns_comparison(): void
    {
        ['user' => $user, 'token' => $token] = $this->createUserWithTaxToken();
        $this->createW2For($user, ['box1_wages' => 123400]);

        $response = $this->mcp($token, 'tools/call', [
            'name' => 'tax_compare_return_lines',
            'arguments' => [
                'year' => 2024,
                'tolerance_cents' => 100,
                'lines' => [
                    ['form' => '1040', 'line' => '1z', 'label' => 'Wages', 'amount_cents' => 12345600],
                ],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertNull($response->json('error'));
        $this->assertNotTrue($response->json('result.isError'));

        $result = json_decode((string) $response->json('result.content.0.text'), true);
        $this->assertSame(1, $result['summary']['different']);
        $this->assertSame(5600, $result['discrepancies'][0]['delta_cents']);
    }

    public function test_mcp_compare_tool_rejects_malformed_lines(): void
    {
        ['token' => $token] = $this->createUserWithTaxToken();

        $response = $this->mcp($token, 'tools/call', [
            'name' => 'tax_compare_return_lines',
            'arguments' => ['year' => 2024, 'lines' => 'not-an-array'],
        ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('result.isError'));

        $response = $this->mcp($token, 'tools/call', [
            'name' => 'tax_compare_return_lines',
            'arguments' => [
                'year' => 2024,
                'lines' => [['form' => '1040', 'line' => '1z', 'amount_cents' => '123']],
            ],
        ]);

        $response->assertStatus(200);
        $this->assertTrue($response->json('result.isError'));
        $this->assertStringContainsString(
            'integer number of cents',
            (string) $response->json('result.content.0.text'),
        );
    }
}
