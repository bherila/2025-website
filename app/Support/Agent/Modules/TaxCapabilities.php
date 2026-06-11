<?php

namespace App\Support\Agent\Modules;

use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;

/**
 * Tax module capability registrations (epic #976 lane 3E). Wired into the
 * registry by AgentServiceProvider (integrator chokepoint).
 */
final class TaxCapabilities
{
    public static function register(CapabilityRegistry $registry): void
    {
        $registry->register(new Capability(
            id: 'tax.compare_return_lines',
            module: 'tax',
            label: 'Compare return lines',
            description: 'Compare CPA-prepared return line amounts (extracted locally by the agent — the return is never uploaded or stored) against the tax preview totals for a year. Pure transient computation with integer-cents math; unknown form/line keys are reported as unmatched_input.',
            requiredPermission: 'finance.tax-preview.view',
            risk: 'read',
            restMethod: 'POST',
            restPath: '/tax/preview/{year}/compare-return-lines',
            mcpTool: 'tax_compare_return_lines',
            openApiTag: 'tax',
            requestSchema: [
                'type' => 'object',
                'required' => ['lines'],
                'properties' => [
                    'return_type' => ['type' => ['string', 'null'], 'maxLength' => 64, 'description' => 'Free-form return descriptor, e.g. cpa_prepared_1040'],
                    'tolerance_cents' => ['type' => ['integer', 'null'], 'minimum' => 0, 'default' => 0, 'description' => 'Absolute per-line tolerance in cents before a delta counts as different'],
                    'lines' => [
                        'type' => 'array',
                        'minItems' => 1,
                        'maxItems' => 500,
                        'items' => [
                            'type' => 'object',
                            'required' => ['form', 'line', 'amount_cents'],
                            'properties' => [
                                'form' => ['type' => 'string', 'description' => 'Form label, e.g. "1040", "Schedule D", "8949"'],
                                'line' => ['type' => 'string', 'description' => 'Line identifier, e.g. "1z", "16"'],
                                'label' => ['type' => ['string', 'null']],
                                'amount_cents' => ['type' => 'integer', 'description' => 'Line amount in integer cents'],
                            ],
                        ],
                    ],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer'],
                    'return_type' => ['type' => ['string', 'null']],
                    'tolerance_cents' => ['type' => 'integer'],
                    'summary' => [
                        'type' => 'object',
                        'properties' => [
                            'matched' => ['type' => 'integer'],
                            'different' => ['type' => 'integer'],
                            'missing_in_preview' => ['type' => 'integer'],
                            'missing_in_return' => ['type' => 'integer'],
                            'unmatched_input' => ['type' => 'integer'],
                        ],
                    ],
                    'discrepancies' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'key' => ['type' => 'string', 'description' => 'Canonical routing id, e.g. form_1040_line_1z'],
                                'form' => ['type' => 'string'],
                                'line' => ['type' => 'string'],
                                'status' => ['type' => 'string', 'enum' => ['different', 'missing_in_preview']],
                                'return_amount_cents' => ['type' => 'integer'],
                                'preview_amount_cents' => ['type' => ['integer', 'null']],
                                'delta_cents' => ['type' => 'integer'],
                                'severity' => ['type' => 'string'],
                            ],
                        ],
                    ],
                    'unmatched_inputs' => ['type' => 'array', 'items' => ['type' => 'object']],
                ],
            ],
            pathParameters: [
                [
                    'name' => 'year',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Tax year to compare against',
                ],
            ],
            examples: [
                'POST /api/agent/v1/tax/preview/2024/compare-return-lines {"tolerance_cents":100,"lines":[{"form":"1040","line":"1z","amount_cents":12345600}]}',
            ],
            routeName: 'agent.tax.compare-return-lines',
        ));
    }
}
