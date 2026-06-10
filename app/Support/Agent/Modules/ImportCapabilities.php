<?php

namespace App\Support\Agent\Modules;

use App\Http\Controllers\Agent\Imports\AgentImportController;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;

/**
 * Imports module capability registrations — the agent wrappers around the
 * GenAI import pipeline. Visibility is gated on finance.access; each job
 * type additionally requires its own permission at runtime
 * (finance_transactions → finance.transactions.import,
 * finance_payslip → finance.payslips.manage, equity_award →
 * finance.rsu.manage, document_extract → finance.tax-documents.manage).
 * Wired into the registry by AgentServiceProvider.
 */
final class ImportCapabilities
{
    public static function register(CapabilityRegistry $registry): void
    {
        $jobTypeDescription = 'Agent job types: '.implode(', ', AgentImportController::AGENT_JOB_TYPES).'. PHR and class-action types are not available via the agent API.';

        $registry->register(new Capability(
            id: 'imports.request_upload',
            module: 'imports',
            label: 'Request import upload URL',
            description: 'Pre-signed S3 PUT URL (15-minute TTL) for a file to be parsed by the GenAI import pipeline. '.$jobTypeDescription,
            requiredPermission: 'finance.access',
            risk: 'upload',
            restMethod: 'POST',
            restPath: '/imports/request-upload',
            openApiTag: 'imports',
            requestSchema: [
                'type' => 'object',
                'required' => ['filename', 'content_type', 'file_size', 'job_type'],
                'properties' => [
                    'filename' => ['type' => 'string', 'maxLength' => 255],
                    'content_type' => ['type' => 'string', 'maxLength' => 128],
                    'file_size' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 52428800],
                    'job_type' => ['type' => 'string', 'enum' => AgentImportController::AGENT_JOB_TYPES],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'signed_url' => ['type' => 'string'],
                    's3_key' => ['type' => 'string'],
                    'expires_in' => ['type' => 'integer'],
                ],
            ],
            examples: ['POST /api/agent/v1/imports/request-upload {"filename":"statement.pdf","content_type":"application/pdf","file_size":12345,"job_type":"finance_transactions"}'],
            routeName: 'agent.imports.request-upload',
        ));

        $registry->register(new Capability(
            id: 'imports.create_job',
            module: 'imports',
            label: 'Create import job',
            description: 'Queue a GenAI parse job for an uploaded file (s3_key from request_upload). Deduplicates by file hash; acct_id must be an owned account. '.$jobTypeDescription,
            requiredPermission: 'finance.access',
            risk: 'write',
            restMethod: 'POST',
            restPath: '/imports/jobs',
            openApiTag: 'imports',
            requestSchema: [
                'type' => 'object',
                'required' => ['s3_key', 'original_filename', 'file_size_bytes', 'job_type'],
                'properties' => [
                    's3_key' => ['type' => 'string', 'maxLength' => 512],
                    'original_filename' => ['type' => 'string', 'maxLength' => 255],
                    'file_size_bytes' => ['type' => 'integer', 'minimum' => 1],
                    'mime_type' => ['type' => ['string', 'null'], 'maxLength' => 128],
                    'job_type' => ['type' => 'string', 'enum' => AgentImportController::AGENT_JOB_TYPES],
                    'context' => ['type' => ['object', 'null']],
                    'acct_id' => ['type' => ['integer', 'null']],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'job_id' => ['type' => 'integer'],
                    'status' => ['type' => 'string'],
                    'deduplicated' => ['type' => 'boolean'],
                ],
            ],
            examples: ['POST /api/agent/v1/imports/jobs {"s3_key":"genai-import/1/.../statement.pdf","original_filename":"statement.pdf","file_size_bytes":12345,"job_type":"finance_transactions","acct_id":12}'],
            routeName: 'agent.imports.jobs.create',
        ));

        $registry->register(new Capability(
            id: 'imports.list_jobs',
            module: 'imports',
            label: 'List import jobs',
            description: 'Owner-scoped, bounded list of non-imported GenAI jobs with parse results. ?job_type ?acct_id filters. '.$jobTypeDescription,
            requiredPermission: 'finance.access',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/imports/jobs',
            openApiTag: 'imports',
            requestSchema: [
                'type' => 'object',
                'properties' => [
                    'job_type' => ['type' => 'string', 'enum' => AgentImportController::AGENT_JOB_TYPES],
                    'acct_id' => ['type' => 'integer'],
                ],
            ],
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'data' => ['type' => 'array', 'items' => ['type' => 'object']],
                ],
            ],
            examples: ['GET /api/agent/v1/imports/jobs?job_type=finance_transactions'],
            routeName: 'agent.imports.jobs',
        ));

        $registry->register(new Capability(
            id: 'imports.get_job',
            module: 'imports',
            label: 'Get import job',
            description: 'Single owner-scoped import job with parse results. Non-owned IDs return 404.',
            requiredPermission: 'finance.access',
            risk: 'read',
            restMethod: 'GET',
            restPath: '/imports/jobs/{id}',
            openApiTag: 'imports',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'id' => ['type' => 'integer'],
                    'job_type' => ['type' => 'string'],
                    'status' => ['type' => 'string'],
                    'results' => ['type' => 'array', 'items' => ['type' => 'object']],
                ],
            ],
            examples: ['GET /api/agent/v1/imports/jobs/42'],
            routeName: 'agent.imports.jobs.show',
        ));

        $registry->register(new Capability(
            id: 'imports.retry_job',
            module: 'imports',
            label: 'Retry import job',
            description: 'Re-queue a failed import job (bounded retry count).',
            requiredPermission: 'finance.access',
            risk: 'write',
            restMethod: 'POST',
            restPath: '/imports/jobs/{id}/retry',
            openApiTag: 'imports',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'job_id' => ['type' => 'integer'],
                    'status' => ['type' => 'string'],
                ],
            ],
            examples: ['POST /api/agent/v1/imports/jobs/42/retry'],
            routeName: 'agent.imports.jobs.retry',
        ));

        $registry->register(new Capability(
            id: 'imports.delete_job',
            module: 'imports',
            label: 'Delete import job',
            description: 'Delete an owner-scoped import job, its parse results, and the uploaded S3 file.',
            requiredPermission: 'finance.access',
            risk: 'destructive',
            restMethod: 'DELETE',
            restPath: '/imports/jobs/{id}',
            openApiTag: 'imports',
            responseSchema: [
                'type' => 'object',
                'properties' => [
                    'success' => ['type' => 'boolean'],
                ],
            ],
            examples: ['DELETE /api/agent/v1/imports/jobs/42'],
            routeName: 'agent.imports.jobs.delete',
        ));
    }
}
