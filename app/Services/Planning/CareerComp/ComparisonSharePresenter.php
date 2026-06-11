<?php

namespace App\Services\Planning\CareerComp;

use App\Models\CareerComparison;

/**
 * Builds share API payloads with the confidential current-job redaction the
 * web UI applies (extracted, behavior-preserving, from CareerCompController),
 * so every surface — web controller, agent REST, MCP tools — shares one
 * redaction path and an exclusive share can never leak current-job values.
 */
class ComparisonSharePresenter
{
    public function __construct(
        private CareerCompCalculator $calculator,
        private ComparisonShareRedactor $shareRedactor,
        private CareerComparisonWorkflowService $workflows,
    ) {}

    /**
     * Build a share's API response, redacting the confidential current job for non-creators.
     *
     * @return array<string, mixed>
     */
    public function shareResponse(CareerComparison $share, bool $isCreator): array
    {
        $response = $this->workflows->response($share);
        $response['isCreator'] = $isCreator;

        if (! $share->share_includes_current && ! $isCreator) {
            $inputs = is_array($response['inputs'] ?? null) ? $response['inputs'] : [];
            $projection = is_array($response['projection'] ?? null) ? $response['projection'] : null;
            [$response['inputs'], $response['projection']] = $this->redactCurrent($inputs, $projection);
            $response['title'] = 'Career comparison';
        }

        return $response;
    }

    /**
     * Strip the confidential current job from inputs and recompute the projection
     * without it, so no current-job dollar value survives directly or derivatively.
     *
     * @param  array<string, mixed>  $inputs
     * @param  array<string, mixed>|null  $projection
     * @return array{0: array<string, mixed>, 1: array<string, mixed>|null}
     */
    public function redactCurrent(array $inputs, ?array $projection): array
    {
        $redacted = $this->shareRedactor->redact($inputs, $projection, $this->currentJobIdsForRedaction($inputs, $projection));
        $redactedProjection = $projection !== null
            ? $this->calculator->project(CareerCompInputs::fromArray($redacted['inputs']))->toArray()
            : null;

        return [$redacted['inputs'], $redactedProjection];
    }

    /**
     * @param  array<string, mixed>  $inputs
     * @param  array<string, mixed>|null  $projection
     * @return list<string>
     */
    private function currentJobIdsForRedaction(array $inputs, ?array $projection): array
    {
        if (is_array($projection) && is_array($projection['currentJobIds'] ?? null)) {
            return array_values(array_filter(array_map(
                static fn (mixed $id): string => trim((string) $id),
                $projection['currentJobIds'],
            ), static fn (string $id): bool => $id !== ''));
        }

        if (is_array($inputs['currentJobs'] ?? null)) {
            return array_values(array_filter(array_map(
                static fn (mixed $job): string => is_array($job) ? trim((string) ($job['id'] ?? '')) : '',
                $inputs['currentJobs'],
            ), static fn (string $id): bool => $id !== ''));
        }

        if (is_array($inputs['currentJob'] ?? null) && is_string($inputs['currentJob']['id'] ?? null)) {
            return [$inputs['currentJob']['id']];
        }

        if (is_array($projection) && is_string($projection['currentJobId'] ?? null)) {
            return [$projection['currentJobId']];
        }

        return [];
    }
}
