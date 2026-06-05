<?php

namespace App\Services\Planning\OpportunityCost;

/**
 * Strips a confidential current job from an Opportunity Cost share by identity
 * (its job id), so an exclusive share never leaks current-job dollar values —
 * directly (its own series) or derivatively (the deltas-vs-current column).
 *
 * Identity-based removal keeps future Phase-5 after-tax fields covered with no
 * changes here: anything keyed under the current job id disappears wholesale.
 */
class ComparisonShareRedactor
{
    /**
     * @param  array<string, mixed>  $inputs
     * @param  array<string, mixed>|null  $projection
     * @return array{inputs: array<string, mixed>, projection: array<string, mixed>|null}
     */
    public function redact(array $inputs, ?array $projection, ?string $currentJobId): array
    {
        return [
            'inputs' => $this->redactInputs($inputs, $currentJobId),
            'projection' => $this->redactProjection($projection, $currentJobId),
        ];
    }

    /**
     * @param  array<string, mixed>  $inputs
     * @return array<string, mixed>
     */
    public function redactInputs(array $inputs, ?string $currentJobId): array
    {
        $currentJob = $inputs['currentJob'] ?? null;

        if (is_array($currentJob) && ($currentJobId === null || ($currentJob['id'] ?? null) === $currentJobId)) {
            $inputs['currentJob'] = null;
        }

        return $inputs;
    }

    /**
     * @param  array<string, mixed>|null  $projection
     * @return array<string, mixed>|null
     */
    public function redactProjection(?array $projection, ?string $currentJobId): ?array
    {
        if ($projection === null) {
            return null;
        }

        // Warnings embed the originating job's name and grant ids, so drop the current job's
        // warnings before its entry is removed (identity-derived tokens, not field names).
        $currentTokens = $this->currentJobTokens($projection, $currentJobId);

        if (isset($projection['jobs']) && is_array($projection['jobs'])) {
            $projection['jobs'] = array_values(array_filter(
                $projection['jobs'],
                fn (mixed $job): bool => ! (is_array($job) && ($job['id'] ?? null) === $currentJobId),
            ));
        }

        // The deltas-vs-current column is derived from the current job (delta = job − current),
        // so any survivor would let a viewer back out the redacted current-job dollar values.
        $projection['deltasVsCurrent'] = [];
        $projection['currentJobId'] = null;

        if (isset($projection['warnings']) && is_array($projection['warnings']) && $currentTokens !== []) {
            $projection['warnings'] = array_values(array_filter(
                $projection['warnings'],
                fn (mixed $warning): bool => ! (is_string($warning) && $this->containsAnyToken($warning, $currentTokens)),
            ));
        }

        return $projection;
    }

    /**
     * Identifying tokens (job name + grant ids) of the current job, gathered from the projection
     * entry itself so warning redaction stays keyed to the same identity that removes the job.
     *
     * @param  array<string, mixed>  $projection
     * @return list<string>
     */
    private function currentJobTokens(array $projection, ?string $currentJobId): array
    {
        if ($currentJobId === null || ! is_array($projection['jobs'] ?? null)) {
            return [];
        }

        foreach ($projection['jobs'] as $job) {
            if (! is_array($job) || ($job['id'] ?? null) !== $currentJobId) {
                continue;
            }

            $tokens = [];
            if (is_string($job['name'] ?? null) && $job['name'] !== '') {
                $tokens[] = $job['name'];
            }

            if (is_array($job['vesting'] ?? null)) {
                foreach ($job['vesting'] as $vesting) {
                    if (is_array($vesting) && is_string($vesting['grantId'] ?? null) && $vesting['grantId'] !== '') {
                        $tokens[] = $vesting['grantId'];
                    }
                }
            }

            return array_values(array_unique($tokens));
        }

        return [];
    }

    /**
     * @param  list<string>  $tokens
     */
    private function containsAnyToken(string $value, array $tokens): bool
    {
        foreach ($tokens as $token) {
            if (str_contains($value, $token)) {
                return true;
            }
        }

        return false;
    }
}
