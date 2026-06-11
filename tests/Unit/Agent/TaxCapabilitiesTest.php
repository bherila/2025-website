<?php

namespace Tests\Unit\Agent;

use App\Support\Agent\AgentContext;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\TaxCapabilities;
use Tests\TestCase;

class TaxCapabilitiesTest extends TestCase
{
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
        TaxCapabilities::register($registry);

        return $registry;
    }

    public function test_registers_compare_return_lines_capability(): void
    {
        $capability = $this->registry()->find('tax.compare_return_lines');

        $this->assertNotNull($capability);
        $this->assertSame('tax', $capability->module);
        $this->assertSame('POST', $capability->restMethod);
        $this->assertSame('/tax/preview/{year}/compare-return-lines', $capability->restPath);
        $this->assertSame('finance.tax-preview.view', $capability->requiredPermission);
        $this->assertSame('tax_compare_return_lines', $capability->mcpTool);
        $this->assertSame('read', $capability->risk);
        $this->assertNotNull($capability->requestSchema);
        $this->assertNotNull($capability->responseSchema);
        $this->assertNotEmpty($capability->examples);
        $this->assertSame('agent.tax.compare-return-lines', $capability->routeName);
    }

    public function test_visibility_requires_tax_preview_view(): void
    {
        $registry = $this->registry();

        $denied = $this->grantFeatures($this->createUser(), ['finance.access']);
        $this->assertSame([], $registry->visibleTo(new AgentContext($denied, null)));

        $allowed = $this->grantFeatures($this->createUser(), ['finance.tax-preview.view']);
        $this->assertSame(
            ['tax.compare_return_lines'],
            array_map(
                fn (Capability $capability): string => $capability->id,
                $registry->visibleTo(new AgentContext($allowed, null)),
            ),
        );
    }
}
