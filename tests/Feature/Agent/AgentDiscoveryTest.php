<?php

namespace Tests\Feature\Agent;

use App\Models\User;
use App\Support\Agent\AgentTokenService;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Payload\AgentPayload;
use Tests\TestCase;

class AgentDiscoveryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();

        // Swap in a fresh registry so these synthetic capabilities fully
        // control the manifests under test (the real module registrations —
        // e.g. FinanceCapabilities — are covered by their own tests and would
        // otherwise collide on ids).
        $registry = new CapabilityRegistry;
        app()->instance(CapabilityRegistry::class, $registry);

        $registry->register(new Capability(
            id: 'finance.payslips.list',
            module: 'finance',
            label: 'List payslips',
            description: 'List the payslips visible to the caller.',
            requiredPermission: 'finance.payslips.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/payslips',
            mcpTool: 'finance_list_payslips',
            openApiTag: 'finance',
            responseSchema: ['type' => 'object'],
        ));

        $registry->register(new Capability(
            id: 'finance.transactions.list',
            module: 'finance',
            label: 'List transactions',
            description: 'List transactions for an account.',
            requiredPermission: 'finance.transactions.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/transactions',
            mcpTool: 'finance_list_transactions',
            openApiTag: 'finance',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer', 'description' => 'Filter by transaction year'],
                    'limit' => ['type' => 'integer', 'default' => 100, 'maximum' => 500],
                ],
            ],
        ));

        $registry->register(new Capability(
            id: 'career.compute',
            module: 'career-comparison',
            label: 'Compute comparison',
            description: 'Public career comparison compute.',
            requiredPermission: null,
            risk: 'read',
            restMethod: 'POST',
            restPath: '/career-comparison/compute',
            openApiTag: 'career-comparison',
            requestSchema: ['type' => 'object'],
        ));
    }

    /** @return array{token: string, user: User} */
    private function createTokenForUser(array $permissions = ['finance.payslips.view'], string $module = 'finance'): array
    {
        $user = $this->grantFeatures($this->createUser(), $permissions);
        $result = app(AgentTokenService::class)->createQuickSetupToken($user, $module, 'claude');

        return ['token' => $result['token'], 'user' => $user];
    }

    /** @return list<string> */
    private function capabilityIds(array $manifest): array
    {
        return array_column($manifest['capabilities'], 'id');
    }

    public function test_anonymous_me_reports_unauthenticated(): void
    {
        $this->getJson('/api/agent/v1/me')
            ->assertStatus(200)
            ->assertExactJson([
                'authenticated' => false,
                'user' => null,
                'token' => null,
                'permissions' => [],
            ]);
    }

    public function test_me_reports_user_token_and_scoped_permissions(): void
    {
        ['token' => $rawToken, 'user' => $user] = $this->createTokenForUser(['finance.payslips.view']);

        $response = $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->assertJson([
                'authenticated' => true,
                'user' => ['id' => $user->id, 'name' => $user->name],
                'token' => ['module' => 'finance', 'purpose' => 'quick_setup'],
            ]);

        $this->assertSame('bha_', substr((string) $response->json('token.token_prefix'), 0, 4));
        $this->assertNotNull($response->json('token.expires_at'));
        $this->assertSame(['finance.access', 'finance.payslips.view'], $response->json('permissions'));
    }

    public function test_me_with_legacy_mcp_key_has_null_token_and_unscoped_permissions(): void
    {
        $rawKey = bin2hex(random_bytes(32));
        $user = $this->grantFeatures(
            $this->createUser(['mcp_api_key' => hash('sha256', $rawKey)]),
            ['finance.payslips.view'],
        );

        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$rawKey])
            ->assertStatus(200)
            ->assertJson([
                'authenticated' => true,
                'user' => ['id' => $user->id],
                'token' => null,
                'permissions' => ['finance.access', 'finance.payslips.view'],
            ]);
    }

    public function test_me_token_scope_shrinks_permissions(): void
    {
        // A tax-module token for a payslips-only user intersects down to just
        // finance.access — the payslips permission is outside the token scope.
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view'], 'tax');

        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->assertJson(['permissions' => ['finance.access']]);
    }

    public function test_anonymous_capabilities_show_public_only(): void
    {
        $manifest = $this->getJson('/api/agent/v1/capabilities')
            ->assertStatus(200)
            ->json();

        $this->assertNull($manifest['module']);
        $this->assertSame('bearer', $manifest['auth']);
        $this->assertStringEndsWith('/api/agent/v1', $manifest['base_url']);
        $this->assertSame(['career.compute'], $this->capabilityIds($manifest));
    }

    public function test_capabilities_include_permissioned_for_authorized_user(): void
    {
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view']);

        $manifest = $this->getJson('/api/agent/v1/capabilities', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();

        // Sorted by id; transactions stays hidden (no permission).
        $this->assertSame(['career.compute', 'finance.payslips.list'], $this->capabilityIds($manifest));

        $payslips = $manifest['capabilities'][1];
        $this->assertSame('GET', $payslips['method']);
        $this->assertSame('/finance/payslips', $payslips['path']);
        $this->assertSame('finance.payslips.view', $payslips['permission']);
        $this->assertSame('read', $payslips['risk']);
        $this->assertSame(['application/json', 'text/toon'], $payslips['content_types']);
    }

    public function test_capabilities_omit_when_token_scope_excludes_permission(): void
    {
        // User HAS the payslips permission, but the tax-module token scope
        // does not include it — discovery must hide the capability.
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view'], 'tax');

        $manifest = $this->getJson('/api/agent/v1/capabilities', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();

        $this->assertSame(['career.compute'], $this->capabilityIds($manifest));
    }

    public function test_discovery_omits_permissioned_capabilities_for_other_module_tokens(): void
    {
        app(CapabilityRegistry::class)->register(new Capability(
            id: 'finance.tax_documents.list',
            module: 'finance',
            label: 'List tax documents',
            description: 'List tax documents.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/tax-documents',
            openApiTag: 'finance',
        ));

        // The tax token scope includes finance.tax-documents.view, but the
        // finance REST routes are pinned to the finance module. Discovery
        // must not advertise finance operations that the token cannot call.
        ['token' => $rawToken] = $this->createTokenForUser(['finance.tax-documents.view'], 'tax');

        $manifest = $this->getJson('/api/agent/v1/capabilities', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();
        $this->assertSame(['career.compute'], $this->capabilityIds($manifest));

        $financeManifest = $this->getJson('/api/agent/v1/finance/capabilities', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();
        $this->assertSame([], $this->capabilityIds($financeManifest));

        $document = $this->getJson('/api/agent/v1/openapi.json', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();
        $this->assertArrayNotHasKey('/finance/tax-documents', $document['paths']);
    }

    public function test_capabilities_toon_endpoint_returns_toon_that_round_trips(): void
    {
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view']);

        $jsonManifest = $this->getJson('/api/agent/v1/capabilities', ['Authorization' => 'Bearer '.$rawToken])->json();

        $toonResponse = $this->get('/api/agent/v1/capabilities.toon', ['Authorization' => 'Bearer '.$rawToken]);
        $toonResponse->assertStatus(200)->assertHeader('Content-Type', 'text/toon; charset=utf-8');

        $this->assertEquals($jsonManifest, AgentPayload::decode($toonResponse->getContent()));
    }

    public function test_module_capabilities_filter_by_module(): void
    {
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view']);

        $manifest = $this->getJson('/api/agent/v1/finance/capabilities', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();

        $this->assertSame('finance', $manifest['module']);
        $this->assertSame(['finance.payslips.list'], $this->capabilityIds($manifest));

        $careerManifest = $this->getJson('/api/agent/v1/career-comparison/capabilities')->json();
        $this->assertSame(['career.compute'], $this->capabilityIds($careerManifest));
    }

    public function test_module_capabilities_toon_variant_works(): void
    {
        $response = $this->get('/api/agent/v1/career-comparison/capabilities.toon');

        $response->assertStatus(200)->assertHeader('Content-Type', 'text/toon; charset=utf-8');
        $decoded = AgentPayload::decode($response->getContent());
        $this->assertSame('career-comparison', $decoded['module']);
    }

    public function test_unknown_module_capabilities_returns_404(): void
    {
        $this->getJson('/api/agent/v1/bogus-module/capabilities')->assertStatus(404);
        $this->getJson('/api/agent/v1/bogus-module/capabilities.toon')->assertStatus(404);
    }

    public function test_anonymous_openapi_is_public_only(): void
    {
        $document = $this->getJson('/api/agent/v1/openapi.json')
            ->assertStatus(200)
            ->json();

        $this->assertSame('3.1.0', $document['openapi']);
        $this->assertSame(['bearerAuth' => ['type' => 'http', 'scheme' => 'bearer']], $document['components']['securitySchemes']);
        $this->assertSame(['/career-comparison/compute'], array_keys($document['paths']));
        $this->assertSame([], $document['paths']['/career-comparison/compute']['post']['security']);
    }

    public function test_openapi_includes_visible_paths_with_vendor_extensions(): void
    {
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view']);

        $document = $this->getJson('/api/agent/v1/openapi.json', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();

        $this->assertSame(['/career-comparison/compute', '/finance/payslips'], array_keys($document['paths']));
        $this->assertArrayNotHasKey('/finance/transactions', $document['paths']);

        $operation = $document['paths']['/finance/payslips']['get'];
        $this->assertSame('finance.payslips.list', $operation['operationId']);
        $this->assertSame('finance', $operation['x-bh-module']);
        $this->assertSame('finance.payslips.list', $operation['x-bh-capability']);
        $this->assertSame('finance.payslips.view', $operation['x-bh-required-permission']);
        $this->assertSame('read', $operation['x-bh-risk']);
        $this->assertSame('finance_list_payslips', $operation['x-bh-mcp-tool']);
        $this->assertSame(['application/json', 'text/toon'], $operation['x-bh-output-formats']);
        $this->assertSame([['bearerAuth' => []]], $operation['security']);
        $this->assertArrayHasKey('200', $operation['responses']);
    }

    public function test_openapi_exposes_get_request_schemas_as_query_parameters(): void
    {
        ['token' => $rawToken] = $this->createTokenForUser(['finance.transactions.view']);

        $document = $this->getJson('/api/agent/v1/openapi.json', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();

        $operation = $document['paths']['/finance/transactions']['get'];
        $this->assertArrayNotHasKey('requestBody', $operation);

        $parameters = collect($operation['parameters'])->keyBy('name');
        $this->assertSame('query', $parameters['year']['in']);
        $this->assertFalse($parameters['year']['required']);
        $this->assertSame(['type' => 'integer'], $parameters['year']['schema']);
        $this->assertSame('Filter by transaction year', $parameters['year']['description']);

        $this->assertSame('query', $parameters['limit']['in']);
        $this->assertSame(['type' => 'integer', 'default' => 100, 'maximum' => 500], $parameters['limit']['schema']);
    }

    public function test_openapi_declares_path_parameters_for_templated_paths(): void
    {
        app(CapabilityRegistry::class)->register(new Capability(
            id: 'finance.tax_preview.get',
            module: 'finance',
            label: 'Get tax preview',
            description: 'Get a tax preview by year.',
            requiredPermission: 'finance.tax-preview.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/tax-preview/{year}',
            openApiTag: 'finance',
            pathParameters: [
                [
                    'name' => 'year',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Tax preview year',
                ],
            ],
        ));

        app(CapabilityRegistry::class)->register(new Capability(
            id: 'finance.tax_documents.get',
            module: 'finance',
            label: 'Get tax document',
            description: 'Get a tax document by ID.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/tax-documents/{id}',
            openApiTag: 'finance',
            pathParameters: [
                [
                    'name' => 'id',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Tax document ID',
                ],
            ],
        ));

        ['token' => $rawToken] = $this->createTokenForUser([
            'finance.tax-preview.view',
            'finance.tax-documents.view',
        ]);

        $document = $this->getJson('/api/agent/v1/openapi.json', ['Authorization' => 'Bearer '.$rawToken])
            ->assertStatus(200)
            ->json();

        $taxPreview = $document['paths']['/finance/tax-preview/{year}']['get'];
        $this->assertSame([
            [
                'name' => 'year',
                'in' => 'path',
                'required' => true,
                'schema' => ['type' => 'integer'],
                'description' => 'Tax preview year',
            ],
        ], $taxPreview['parameters']);

        $taxDocument = $document['paths']['/finance/tax-documents/{id}']['get'];
        $this->assertSame([
            [
                'name' => 'id',
                'in' => 'path',
                'required' => true,
                'schema' => ['type' => 'integer'],
                'description' => 'Tax document ID',
            ],
        ], $taxDocument['parameters']);
    }

    public function test_openapi_token_scope_filters_paths(): void
    {
        ['token' => $rawToken] = $this->createTokenForUser(['finance.payslips.view'], 'tax');

        $document = $this->getJson('/api/agent/v1/openapi.json', ['Authorization' => 'Bearer '.$rawToken])->json();

        $this->assertArrayNotHasKey('/finance/payslips', $document['paths']);
    }

    public function test_invalid_token_on_discovery_returns_401(): void
    {
        $this->getJson('/api/agent/v1/capabilities', ['Authorization' => 'Bearer bha_bogus'])
            ->assertStatus(401);
        $this->getJson('/api/agent/v1/me', ['Authorization' => 'Bearer bha_bogus'])
            ->assertStatus(401);
    }
}
