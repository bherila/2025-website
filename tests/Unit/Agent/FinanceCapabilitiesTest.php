<?php

namespace Tests\Unit\Agent;

use App\Mcp\Servers\Finance;
use App\Support\Agent\AgentContext;
use App\Support\Agent\AgentTokenService;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\FinanceCapabilities;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use ReflectionClass;
use Tests\TestCase;

class FinanceCapabilitiesTest extends TestCase
{
    private const EXPECTED = [
        'finance.accounts.list' => ['finance.accounts.basic', 'list-accounts', '/finance/accounts'],
        'finance.transactions.list' => ['finance.transactions.view', 'list-transactions', '/finance/transactions'],
        'finance.tax_preview.get' => ['finance.tax-preview.view', 'get-tax-preview', '/finance/tax-preview/{year}'],
        'finance.tax_documents.list' => ['finance.tax-documents.view', 'list-tax-documents', '/finance/tax-documents'],
        'finance.tax_documents.get' => ['finance.tax-documents.view', 'get-tax-document', '/finance/tax-documents/{id}'],
        'finance.lots.list' => ['finance.lots.view', 'list-lots', '/finance/lots'],
        'finance.payslips.list' => ['finance.payslips.view', 'list-payslips', '/finance/payslips'],
    ];

    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();
    }

    private function registry(): CapabilityRegistry
    {
        $registry = new CapabilityRegistry;
        FinanceCapabilities::register($registry);

        return $registry;
    }

    public function test_registers_one_capability_per_finance_read_endpoint(): void
    {
        $registry = $this->registry();

        $this->assertEqualsCanonicalizing(
            array_keys(self::EXPECTED),
            array_map(fn (Capability $capability): string => $capability->id, $registry->forModule('finance')),
        );
    }

    public function test_capability_metadata_matches_endpoint_contracts(): void
    {
        $registry = $this->registry();

        foreach (self::EXPECTED as $id => [$permission, $mcpTool, $restPath]) {
            $capability = $registry->find($id);

            $this->assertNotNull($capability, $id);
            $this->assertSame('finance', $capability->module);
            $this->assertSame('GET', $capability->restMethod, $id);
            $this->assertSame($restPath, $capability->restPath, $id);
            $this->assertSame($permission, $capability->requiredPermission, $id);
            $this->assertSame($mcpTool, $capability->mcpTool, $id);
            $this->assertSame('read', $capability->risk, $id);
            $this->assertNotEmpty($capability->examples, $id);
            $this->assertNotNull($capability->responseSchema, $id);
            $this->assertNotNull($capability->routeName, $id);
            $this->assertTrue(Route::has($capability->routeName), "Route [{$capability->routeName}] for [{$id}] must exist.");
        }
    }

    public function test_mcp_tool_names_reference_real_finance_server_tools(): void
    {
        $reflection = new ReflectionClass(Finance::class);
        $toolClasses = $reflection->getProperty('tools')->getDefaultValue();
        $serverToolNames = array_map(
            fn (string $class): string => Str::kebab(class_basename($class)),
            $toolClasses,
        );

        foreach ($this->registry()->forModule('finance') as $capability) {
            $this->assertContains($capability->mcpTool, $serverToolNames, $capability->id);
        }
    }

    public function test_visibility_is_filtered_by_permission(): void
    {
        $registry = $this->registry();
        $user = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);

        $visible = $registry->visibleTo(new AgentContext($user, null));

        $this->assertSame(
            ['finance.payslips.list'],
            array_map(fn (Capability $capability): string => $capability->id, $visible),
        );
    }

    public function test_container_registry_includes_finance_module(): void
    {
        $ids = array_map(
            fn (Capability $capability): string => $capability->id,
            app(CapabilityRegistry::class)->forModule('finance'),
        );

        $this->assertEqualsCanonicalizing(array_keys(self::EXPECTED), $ids);
    }

    public function test_finance_module_manifest_serves_registered_capabilities(): void
    {
        $user = $this->grantFeatures($this->createUser(), [
            'finance.accounts.basic',
            'finance.transactions.view',
            'finance.tax-preview.view',
            'finance.tax-documents.view',
            'finance.lots.view',
            'finance.payslips.view',
        ]);
        $token = app(AgentTokenService::class)->createQuickSetupToken($user, 'finance', null)['token'];

        $manifest = $this->getJson('/api/agent/v1/finance/capabilities', ['Authorization' => 'Bearer '.$token])
            ->assertStatus(200)
            ->json();

        $this->assertSame('finance', $manifest['module']);
        $this->assertEqualsCanonicalizing(
            array_keys(self::EXPECTED),
            array_column($manifest['capabilities'], 'id'),
        );
    }
}
