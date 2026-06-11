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

    public function test_registers_tax_capabilities(): void
    {
        $registry = $this->registry();

        $this->assertEqualsCanonicalizing([
            'tax.preview.get',
            'tax.documents.list',
            'tax.documents.get',
            'tax.documents.download_url',
            'tax.compare_return_lines',
        ], array_map(
            fn (Capability $capability): string => $capability->id,
            $registry->forModule('tax'),
        ));

        $capability = $registry->find('tax.compare_return_lines');

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

        $preview = $registry->find('tax.preview.get');
        $this->assertNotNull($preview);
        $this->assertSame('/tax/preview/{year}', $preview->restPath);
        $this->assertSame('get-tax-preview', $preview->mcpTool);
        $this->assertSame('agent.tax.preview', $preview->routeName);

        $download = $registry->find('tax.documents.download_url');
        $this->assertNotNull($download);
        $this->assertSame('download', $download->risk);
        $this->assertSame('/tax/documents/{id}/download-url', $download->restPath);
        $this->assertSame('finance.tax-documents.view', $download->requiredPermission);
    }

    public function test_visibility_filters_by_tax_permissions(): void
    {
        $registry = $this->registry();

        $denied = $this->grantFeatures($this->createUser(), ['finance.access']);
        $this->assertSame([], $registry->visibleTo(new AgentContext($denied, null)));

        $previewOnly = $this->grantFeatures($this->createUser(), ['finance.tax-preview.view']);
        $this->assertSame(
            ['tax.preview.get', 'tax.compare_return_lines'],
            array_map(
                fn (Capability $capability): string => $capability->id,
                $registry->visibleTo(new AgentContext($previewOnly, null)),
            ),
        );

        $documentsOnly = $this->grantFeatures($this->createUser(), ['finance.tax-documents.view']);
        $this->assertEqualsCanonicalizing(
            ['tax.documents.list', 'tax.documents.get', 'tax.documents.download_url'],
            array_map(
                fn (Capability $capability): string => $capability->id,
                $registry->visibleTo(new AgentContext($documentsOnly, null)),
            ),
        );
    }
}
