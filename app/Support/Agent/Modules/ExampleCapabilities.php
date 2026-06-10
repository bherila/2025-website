<?php

namespace App\Support\Agent\Modules;

use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;

/**
 * Example capability registrations used ONLY by tests. Real module
 * registrations (FinanceCapabilities, CareerComparisonCapabilities,
 * TaxCapabilities, ImportCapabilities) land in later PRs and are wired in
 * AgentServiceProvider; this class must never be registered there.
 */
final class ExampleCapabilities
{
    public static function register(CapabilityRegistry $registry): void
    {
        $registry->register(new Capability(
            id: 'example.public.ping',
            module: 'example',
            label: 'Ping',
            description: 'Public connectivity check.',
            requiredPermission: null,
            risk: 'read',
            restMethod: 'GET',
            restPath: '/ping',
            openApiTag: 'example',
            examples: ['GET /api/agent/v1/ping'],
        ));

        $registry->register(new Capability(
            id: 'example.payslips.list',
            module: 'example',
            label: 'List payslips (example)',
            description: 'Permissioned example capability.',
            requiredPermission: 'finance.payslips.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/example/payslips',
            mcpTool: 'example_list_payslips',
            openApiTag: 'example',
        ));
    }
}
