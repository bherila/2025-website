<?php

namespace App\Support\Agent\Modules;

use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;

/**
 * Career Comparison module capability registrations. Share read and compute
 * are public (anonymous read-only); private CRUD requires
 * financial-planning.career-comparison.private and import-rsu requires
 * finance.rsu.view. Anonymous share editing (the web app's PUT s/{code}) is
 * deliberately absent from the agent surface. Wired into the registry by
 * AgentServiceProvider.
 */
final class CareerComparisonCapabilities
{
    private const SHARE_CODE_PARAMETER = [
        'name' => 'code',
        'in' => 'path',
        'required' => true,
        'schema' => ['type' => 'string'],
        'description' => 'Share short code from the share URL',
    ];

    private const INPUTS_REQUEST_SCHEMA = [
        'type' => 'object',
        'required' => ['inputs'],
        'properties' => [
            'inputs' => [
                'type' => 'object',
                'description' => 'Full comparison inputs: startYear, horizonYears, currentJobs[], hypotheticalJobs[], optional modelAssumptions',
                'properties' => [
                    'startYear' => ['type' => 'integer'],
                    'horizonYears' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 30],
                    'currentJobs' => ['type' => 'array', 'items' => ['type' => 'object']],
                    'hypotheticalJobs' => ['type' => 'array', 'items' => ['type' => 'object']],
                    'modelAssumptions' => ['type' => 'object'],
                ],
            ],
        ],
    ];

    private const WORKFLOW_RESPONSE_SCHEMA = [
        'type' => 'object',
        'properties' => [
            'id' => ['type' => 'integer'],
            'title' => ['type' => 'string'],
            'shortCode' => ['type' => ['string', 'null']],
            'shareUrl' => ['type' => ['string', 'null']],
            'expiresAt' => ['type' => ['string', 'null'], 'format' => 'date-time'],
            'inputs' => ['type' => 'object'],
            'projection' => ['type' => ['object', 'null']],
        ],
    ];

    public static function register(CapabilityRegistry $registry): void
    {
        $registry->register(new Capability(
            id: 'career_comparison.share.get',
            module: 'career-comparison',
            label: 'Read public share',
            description: 'Read a public Career Comparison share by short code. Anonymous and read-only; confidential current-job data is redacted for non-creators; expired or unknown codes return 404.',
            requiredPermission: null,
            risk: 'read',
            restMethod: 'GET',
            restPath: '/career-comparison/shares/{code}',
            mcpTool: 'career_get_public_share',
            openApiTag: 'career-comparison',
            responseSchema: self::WORKFLOW_RESPONSE_SCHEMA,
            pathParameters: [self::SHARE_CODE_PARAMETER],
            examples: ['GET /api/agent/v1/career-comparison/shares/a1b2c3'],
            routeName: 'agent.career-comparison.shares.show',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.compute',
            module: 'career-comparison',
            label: 'Compute projection',
            description: 'Stateless multi-year compensation projection from a full inputs object. Anonymous; nothing is persisted. Throttled to 60 requests/minute.',
            requiredPermission: null,
            risk: 'read',
            restMethod: 'POST',
            restPath: '/career-comparison/compute',
            openApiTag: 'career-comparison',
            requestSchema: self::INPUTS_REQUEST_SCHEMA,
            responseSchema: ['type' => 'object', 'description' => 'Projection: per-job yearly series, cumulative totals, and deltas vs current'],
            examples: ['POST /api/agent/v1/career-comparison/compute {"inputs": {...}}'],
            routeName: 'agent.career-comparison.compute',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.latest.get',
            module: 'career-comparison',
            label: 'Get private latest',
            description: 'The token owner\'s private latest comparison (inputs and projection), or workflow: null when none exists.',
            requiredPermission: 'financial-planning.career-comparison.private',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/career-comparison/latest',
            mcpTool: 'career_get_latest_comparison',
            openApiTag: 'career-comparison',
            responseSchema: [
                'type' => 'object',
                'properties' => ['workflow' => array_merge(self::WORKFLOW_RESPONSE_SCHEMA, ['type' => ['object', 'null']])],
            ],
            examples: ['GET /api/agent/v1/career-comparison/latest'],
            routeName: 'agent.career-comparison.latest',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.latest.save',
            module: 'career-comparison',
            label: 'Save private latest',
            description: 'Upsert the token owner\'s single private latest comparison from a full inputs object (web-app validation rules apply).',
            requiredPermission: 'financial-planning.career-comparison.private',
            risk: 'write',
            restMethod: 'PUT',
            restPath: '/career-comparison/latest',
            mcpTool: 'career_save_latest_comparison',
            openApiTag: 'career-comparison',
            requestSchema: self::INPUTS_REQUEST_SCHEMA,
            responseSchema: self::WORKFLOW_RESPONSE_SCHEMA,
            examples: ['PUT /api/agent/v1/career-comparison/latest {"inputs": {...}}'],
            routeName: 'agent.career-comparison.latest.save',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.share.create',
            module: 'career-comparison',
            label: 'Create share',
            description: 'Fork the submitted inputs into a new link-shareable copy. shareIncludesCurrent=false redacts the current job for non-creators; optional expiresAt.',
            requiredPermission: 'financial-planning.career-comparison.private',
            risk: 'write',
            restMethod: 'POST',
            restPath: '/career-comparison/share',
            openApiTag: 'career-comparison',
            requestSchema: array_replace_recursive(self::INPUTS_REQUEST_SCHEMA, [
                'properties' => [
                    'shareIncludesCurrent' => ['type' => 'boolean', 'default' => true],
                    'expiresAt' => ['type' => ['string', 'null'], 'format' => 'date-time'],
                ],
            ]),
            responseSchema: self::WORKFLOW_RESPONSE_SCHEMA,
            examples: ['POST /api/agent/v1/career-comparison/share {"inputs": {...}, "shareIncludesCurrent": false}'],
            routeName: 'agent.career-comparison.share',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.share.update',
            module: 'career-comparison',
            label: 'Update share expiration',
            description: 'Creator-only: set or clear a shared fork\'s expiration timestamp.',
            requiredPermission: 'financial-planning.career-comparison.private',
            risk: 'write',
            restMethod: 'PATCH',
            restPath: '/career-comparison/shares/{code}',
            openApiTag: 'career-comparison',
            requestSchema: [
                'type' => 'object',
                'properties' => ['expiresAt' => ['type' => ['string', 'null'], 'format' => 'date-time']],
            ],
            responseSchema: self::WORKFLOW_RESPONSE_SCHEMA,
            pathParameters: [self::SHARE_CODE_PARAMETER],
            examples: ['PATCH /api/agent/v1/career-comparison/shares/a1b2c3 {"expiresAt": "2026-12-31T00:00:00Z"}'],
            routeName: 'agent.career-comparison.shares.update',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.share.delete',
            module: 'career-comparison',
            label: 'Delete share',
            description: 'Creator-only: delete a shared fork and prune its orphaned job rows.',
            requiredPermission: 'financial-planning.career-comparison.private',
            risk: 'destructive',
            restMethod: 'DELETE',
            restPath: '/career-comparison/shares/{code}',
            openApiTag: 'career-comparison',
            responseSchema: [
                'type' => 'object',
                'properties' => ['deleted' => ['type' => 'boolean']],
            ],
            pathParameters: [self::SHARE_CODE_PARAMETER],
            examples: ['DELETE /api/agent/v1/career-comparison/shares/a1b2c3'],
            routeName: 'agent.career-comparison.shares.delete',
        ));

        $registry->register(new Capability(
            id: 'career_comparison.import_rsu',
            module: 'career-comparison',
            label: 'Import RSU grants',
            description: 'Build a currentJob spec from the token owner\'s actual equity awards (grants, vest schedule, latest share price). Read-only: nothing persists until the returned inputs are saved.',
            requiredPermission: 'finance.rsu.view',
            risk: 'read',
            restMethod: 'POST',
            restPath: '/career-comparison/import-rsu',
            mcpTool: 'career_import_rsu',
            openApiTag: 'career-comparison',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'currentJob' => ['type' => ['object', 'null'], 'description' => 'Optional existing currentJob spec to merge imported grants into'],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'currentJob' => ['type' => 'object'],
                    'importedGrants' => ['type' => 'array', 'items' => ['type' => 'object']],
                ],
            ],
            examples: ['POST /api/agent/v1/career-comparison/import-rsu {}'],
            routeName: 'agent.career-comparison.import-rsu',
        ));
    }
}
