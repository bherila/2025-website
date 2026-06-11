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
            id: 'tax.preview.get',
            module: 'tax',
            label: 'Get tax preview',
            description: 'Agent-safe tax preview dataset for a year. ?include_tax_facts=1 adds backend tax fact source lines.',
            requiredPermission: 'finance.tax-preview.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/tax/preview/{year}',
            mcpTool: 'get-tax-preview',
            openApiTag: 'tax',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'include_tax_facts' => ['type' => 'boolean', 'default' => false],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer'],
                    'availableYears' => ['type' => 'array', 'items' => ['type' => 'integer']],
                ],
            ],
            pathParameters: [self::yearPathParameter()],
            examples: ['GET /api/agent/v1/tax/preview/2024?include_tax_facts=1'],
            routeName: 'agent.tax.preview',
        ));

        $registry->register(new Capability(
            id: 'tax.documents.list',
            module: 'tax',
            label: 'List tax documents',
            description: 'Tax document metadata (W-2, 1099 variants, K-1, Form 1116). parsed_data is only available on the detail endpoint.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/tax/documents',
            openApiTag: 'tax',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer'],
                    'form_type' => ['type' => 'string', 'description' => 'Comma-separated form types, e.g. w2,1099_int,broker_1099'],
                    'is_reviewed' => ['type' => 'boolean'],
                    'limit' => ['type' => 'integer', 'default' => 100, 'maximum' => 500],
                    'cursor' => ['type' => 'integer'],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'tax_documents' => ['type' => 'array', 'items' => ['type' => 'object']],
                    'next_cursor' => ['type' => ['integer', 'null']],
                ],
            ],
            examples: ['GET /api/agent/v1/tax/documents?year=2024&is_reviewed=true'],
            routeName: 'agent.tax.documents',
        ));

        $registry->register(new Capability(
            id: 'tax.documents.get',
            module: 'tax',
            label: 'Get tax document',
            description: 'Single tax document by ID including the full parsed_data blob. Non-owned IDs return 404.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/tax/documents/{id}',
            openApiTag: 'tax',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'integer'],
                    'tax_year' => ['type' => 'integer'],
                    'form_type' => ['type' => 'string'],
                    'parsed_data' => ['type' => ['object', 'null']],
                ],
            ],
            pathParameters: [self::documentIdPathParameter()],
            examples: ['GET /api/agent/v1/tax/documents/42'],
            routeName: 'agent.tax.documents.show',
        ));

        $registry->register(new Capability(
            id: 'tax.documents.download_url',
            module: 'tax',
            label: 'Get tax document download URL',
            description: 'Owner-scoped one-hour signed download and inline-view URLs for a stored tax document file.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'download',
            restMethod: 'GET',
            restPath: '/tax/documents/{id}/download-url',
            openApiTag: 'tax',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'download_url' => ['type' => 'string'],
                    'view_url' => ['type' => 'string'],
                    'expires_in_seconds' => ['type' => 'integer'],
                    'filename' => ['type' => 'string'],
                    'content_type' => ['type' => ['string', 'null']],
                ],
            ],
            pathParameters: [self::documentIdPathParameter()],
            examples: ['GET /api/agent/v1/tax/documents/42/download-url'],
            routeName: 'agent.tax.documents.download-url',
        ));

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
            pathParameters: [self::yearPathParameter()],
            examples: [
                'POST /api/agent/v1/tax/preview/2024/compare-return-lines {"tolerance_cents":100,"lines":[{"form":"1040","line":"1z","amount_cents":12345600}]}',
            ],
            routeName: 'agent.tax.compare-return-lines',
        ));
    }

    /** @return array<string, mixed> */
    private static function yearPathParameter(): array
    {
        return [
            'name' => 'year',
            'in' => 'path',
            'required' => true,
            'schema' => ['type' => 'integer'],
            'description' => 'Tax year',
        ];
    }

    /** @return array<string, mixed> */
    private static function documentIdPathParameter(): array
    {
        return [
            'name' => 'id',
            'in' => 'path',
            'required' => true,
            'schema' => ['type' => 'integer'],
            'description' => 'Tax document ID',
        ];
    }
}
