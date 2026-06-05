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

        return $projection;
    }
}
