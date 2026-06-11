<?php

namespace Tests\Feature;

use App\Mcp\Tools\ListTransactions;
use App\Models\AgentApiToken;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * MCP discovery filtering (FiltersByFeature::shouldRegister). tools/list must
 * omit tools the caller cannot use — per user feature permission AND per
 * agent token scope — and hidden tools must also be uninvokable via
 * tools/call (laravel/mcp resolves CallTool from the same filtered list).
 */
class McpToolVisibilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();
    }

    private function legacyKeyFor(User $user): string
    {
        $raw = bin2hex(random_bytes(32));
        $user->forceFill(['mcp_api_key' => hash('sha256', $raw)])->save();

        return $raw;
    }

    private function mcp(string $rawToken, string $method, array $params = []): TestResponse
    {
        return $this->postJson('/mcp/finance', [
            'jsonrpc' => '2.0',
            'id' => 1,
            'method' => $method,
            'params' => $params,
        ], ['Authorization' => 'Bearer '.$rawToken]);
    }

    /** @return list<string> */
    private function toolNames(string $rawToken): array
    {
        $response = $this->mcp($rawToken, 'tools/list');
        $response->assertStatus(200);

        return collect($response->json('result.tools'))->pluck('name')->all();
    }

    public function test_tools_list_includes_only_permitted_tools(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);
        $names = $this->toolNames($this->legacyKeyFor($user));

        $this->assertContains('list-payslips', $names);
        $this->assertNotContains('list-transactions', $names);
        $this->assertNotContains('list-accounts', $names);
        $this->assertNotContains('get-tax-preview', $names);
        $this->assertNotContains('get-account-summary', $names);
    }

    public function test_tools_list_shows_all_tools_for_admin(): void
    {
        $admin = $this->createAdminUser();
        $names = $this->toolNames($this->legacyKeyFor($admin));

        $expected = [
            'get-tax-preview', 'list-tax-documents', 'get-tax-document',
            'list-accounts', 'get-account-summary', 'list-transactions',
            'list-lots', 'get-schedule-c', 'list-employment-entities',
            'list-tags', 'get-marriage-status', 'list-payslips',
        ];
        $this->assertEqualsCanonicalizing($expected, $names);
    }

    public function test_hidden_tool_cannot_be_invoked(): void
    {
        $user = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);
        $key = $this->legacyKeyFor($user);

        $denied = $this->mcp($key, 'tools/call', ['name' => 'list-transactions', 'arguments' => []]);
        $denied->assertStatus(200);
        $this->assertStringContainsString('not found', (string) $denied->json('error.message'));

        $allowed = $this->mcp($key, 'tools/call', ['name' => 'list-payslips', 'arguments' => []]);
        $allowed->assertStatus(200);
        $this->assertNull($allowed->json('error'));
        $this->assertNotTrue($allowed->json('result.isError'));
    }

    public function test_token_scope_filters_tools_list_and_call(): void
    {
        $user = $this->grantFeatures($this->createUser(), [
            'finance.payslips.view',
            'finance.transactions.view',
        ]);

        $rawToken = 'bha_'.bin2hex(random_bytes(32));
        AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $rawToken),
            'allowed_permissions' => ['finance.access', 'finance.payslips.view'],
        ]);

        $names = $this->toolNames($rawToken);
        $this->assertContains('list-payslips', $names);
        $this->assertNotContains('list-transactions', $names);

        $denied = $this->mcp($rawToken, 'tools/call', ['name' => 'list-transactions', 'arguments' => []]);
        $this->assertStringContainsString('not found', (string) $denied->json('error.message'));

        // The same user with an unscoped legacy key sees both tools.
        $legacyNames = $this->toolNames($this->legacyKeyFor($user));
        $this->assertContains('list-payslips', $legacyNames);
        $this->assertContains('list-transactions', $legacyNames);
    }

    public function test_resources_list_is_filtered_by_permission(): void
    {
        $payslipsOnly = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);
        $response = $this->mcp($this->legacyKeyFor($payslipsOnly), 'resources/list');
        $response->assertStatus(200);
        $this->assertSame([], collect($response->json('result.resources'))->pluck('uri')->all());

        $withAccounts = $this->grantFeatures($this->createUser(), ['finance.accounts.basic']);
        $uris = collect($this->mcp($this->legacyKeyFor($withAccounts), 'resources/list')->json('result.resources'))
            ->pluck('uri')
            ->all();
        $this->assertContains('finance://accounts', $uris);
        $this->assertNotContains('finance://tax-documents/reviewed', $uris);
    }

    public function test_should_register_returns_true_in_console_without_auth(): void
    {
        Auth::logout();

        // Preserves stdio/`mcp:start` behavior: with no authenticated user in
        // a console context, registration is allowed and the runtime
        // permission check in handle() remains the guard.
        $this->assertTrue(app(ListTransactions::class)->shouldRegister());
    }
}
