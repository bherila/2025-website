<?php

namespace App\Support\Agent\Modules;

use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;

/**
 * Finance module capability registrations — agent REST endpoints
 * (routes/agent.php), mirrored by finance MCP tools where a tool exists.
 * Wired into the registry by AgentServiceProvider.
 */
final class FinanceCapabilities
{
    public static function register(CapabilityRegistry $registry): void
    {
        $registry->register(new Capability(
            id: 'finance.accounts.list',
            module: 'finance',
            label: 'List accounts',
            description: 'Owner-scoped account list grouped by asset/liability/retirement type. Balance detail fields require finance.accounts.detail.',
            requiredPermission: 'finance.accounts.basic',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/accounts',
            mcpTool: 'list-accounts',
            openApiTag: 'finance',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'include_detail' => ['type' => 'boolean'],
                    'accounts' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'acct_id' => ['type' => 'integer'],
                                'acct_name' => ['type' => 'string'],
                                'acct_is_debt' => ['type' => 'boolean'],
                                'acct_is_retirement' => ['type' => 'boolean'],
                                'when_closed' => ['type' => ['string', 'null'], 'format' => 'date'],
                            ],
                        ],
                    ],
                ],
            ],
            examples: ['GET /api/agent/v1/finance/accounts'],
            routeName: 'agent.finance.accounts',
        ));

        $registry->register(new Capability(
            id: 'finance.transactions.list',
            module: 'finance',
            label: 'List transactions',
            description: 'Owner-scoped transaction list, newest first, with offset-cursor pagination. A non-owned acct_id returns 404.',
            requiredPermission: 'finance.transactions.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/transactions',
            mcpTool: 'list-transactions',
            openApiTag: 'finance',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'acct_id' => ['type' => 'integer', 'description' => 'Filter to one owned account'],
                    'year' => ['type' => 'integer', 'description' => 'Filter by transaction year'],
                    'tag' => ['type' => 'string', 'description' => 'Filter by tag label'],
                    'limit' => ['type' => 'integer', 'default' => 100, 'maximum' => 500],
                    'cursor' => ['type' => 'integer', 'description' => 'Offset cursor from next_cursor'],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'transactions' => ['type' => 'array', 'items' => ['type' => 'object']],
                    'next_cursor' => ['type' => ['integer', 'null']],
                ],
            ],
            examples: [
                'GET /api/agent/v1/finance/transactions?year=2024&limit=200',
                'GET /api/agent/v1/finance/transactions?acct_id=12&tag=Rent',
            ],
            routeName: 'agent.finance.transactions',
        ));

        $registry->register(new Capability(
            id: 'finance.tax_preview.get',
            module: 'finance',
            label: 'Get tax preview',
            description: 'Full tax preview dataset for a year (W-2s, 1099s, Schedule C, capital gains, employment entities). ?include_tax_facts=1 adds backend tax fact source lines.',
            requiredPermission: 'finance.tax-preview.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/tax-preview/{year}',
            mcpTool: 'get-tax-preview',
            openApiTag: 'finance',
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
            pathParameters: [
                [
                    'name' => 'year',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Tax preview year',
                ],
            ],
            examples: ['GET /api/agent/v1/finance/tax-preview/2024?include_tax_facts=1'],
            routeName: 'agent.finance.tax-preview',
        ));

        $registry->register(new Capability(
            id: 'finance.tax_documents.list',
            module: 'finance',
            label: 'List tax documents',
            description: 'Tax document metadata (W-2, 1099 variants, K-1, Form 1116). parsed_data is only available on the detail endpoint.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/tax-documents',
            mcpTool: 'list-tax-documents',
            openApiTag: 'finance',
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
            examples: ['GET /api/agent/v1/finance/tax-documents?year=2024&is_reviewed=true'],
            routeName: 'agent.finance.tax-documents',
        ));

        $registry->register(new Capability(
            id: 'finance.tax_documents.get',
            module: 'finance',
            label: 'Get tax document',
            description: 'Single tax document by ID including the full parsed_data blob. Non-owned IDs return 404.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/tax-documents/{id}',
            mcpTool: 'get-tax-document',
            openApiTag: 'finance',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'integer'],
                    'tax_year' => ['type' => 'integer'],
                    'form_type' => ['type' => 'string'],
                    'parsed_data' => ['type' => ['object', 'null']],
                ],
            ],
            pathParameters: [
                [
                    'name' => 'id',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Tax document ID',
                ],
            ],
            examples: ['GET /api/agent/v1/finance/tax-documents/42'],
            routeName: 'agent.finance.tax-documents.show',
        ));

        $registry->register(new Capability(
            id: 'finance.tax_documents.download_url',
            module: 'finance',
            label: 'Get tax document download URL',
            description: 'Owner-scoped one-hour signed download and inline-view URLs for a stored tax document file.',
            requiredPermission: 'finance.tax-documents.view',
            risk: 'download',
            restMethod: 'GET',
            restPath: '/finance/tax-documents/{id}/download-url',
            openApiTag: 'finance',
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
            pathParameters: [
                [
                    'name' => 'id',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Tax document ID',
                ],
            ],
            examples: ['GET /api/agent/v1/finance/tax-documents/42/download-url'],
            routeName: 'agent.finance.tax-documents.download-url',
        ));

        $registry->register(new Capability(
            id: 'finance.documents.download_url',
            module: 'finance',
            label: 'Get finance document download URL',
            description: 'Owner-scoped one-hour signed download and inline-view URLs for a stored finance document file.',
            requiredPermission: 'finance.accounts.detail',
            risk: 'download',
            restMethod: 'GET',
            restPath: '/finance/documents/{id}/download-url',
            openApiTag: 'finance',
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
            pathParameters: [
                [
                    'name' => 'id',
                    'in' => 'path',
                    'required' => true,
                    'schema' => ['type' => 'integer'],
                    'description' => 'Finance document ID',
                ],
            ],
            examples: ['GET /api/agent/v1/finance/documents/42/download-url'],
            routeName: 'agent.finance.documents.download-url',
        ));

        $registry->register(new Capability(
            id: 'finance.lots.list',
            module: 'finance',
            label: 'List lots',
            description: 'Owner-scoped investment lots. ?year returns lots held at that year-end; without it only open lots.',
            requiredPermission: 'finance.lots.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/lots',
            mcpTool: 'list-lots',
            openApiTag: 'finance',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'acct_id' => ['type' => 'integer'],
                    'year' => ['type' => 'integer', 'description' => 'Lots held on December 31 of this year'],
                    'limit' => ['type' => 'integer', 'default' => 100, 'maximum' => 500],
                    'cursor' => ['type' => 'integer'],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'lots' => ['type' => 'array', 'items' => ['type' => 'object']],
                    'next_cursor' => ['type' => ['integer', 'null']],
                ],
            ],
            examples: ['GET /api/agent/v1/finance/lots?year=2024'],
            routeName: 'agent.finance.lots',
        ));

        $registry->register(new Capability(
            id: 'finance.payslips.list',
            module: 'finance',
            label: 'List payslips',
            description: 'Owner-scoped payslips with earnings, taxes, deductions, per-state tax data, and deposit splits.',
            requiredPermission: 'finance.payslips.view',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/finance/payslips',
            mcpTool: 'list-payslips',
            openApiTag: 'finance',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'year' => ['type' => 'integer'],
                    'has_rsu' => ['type' => 'boolean'],
                    'has_bonus' => ['type' => 'boolean'],
                    'limit' => ['type' => 'integer', 'default' => 100, 'maximum' => 500],
                    'cursor' => ['type' => 'integer'],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'payslips' => ['type' => 'array', 'items' => ['type' => 'object']],
                    'next_cursor' => ['type' => ['integer', 'null']],
                ],
            ],
            examples: ['GET /api/agent/v1/finance/payslips?year=2024&has_rsu=true'],
            routeName: 'agent.finance.payslips',
        ));
    }
}
