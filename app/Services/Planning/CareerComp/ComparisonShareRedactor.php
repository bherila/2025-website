<?php

namespace App\Services\Planning\CareerComp;

/**
 * Strips confidential current jobs from a Career Comparison share by identity
 * (their job ids), so an exclusive share never leaks current-job dollar values —
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
     * @param  string|list<string>|null  $currentJobIds
     * @return array{inputs: array<string, mixed>, projection: array<string, mixed>|null}
     */
    public function redact(array $inputs, ?array $projection, string|array|null $currentJobIds): array
    {
        $ids = $this->normalizeCurrentJobIds($currentJobIds);

        return [
            'inputs' => $this->redactInputs($inputs, $ids),
            'projection' => $this->redactProjection($projection, $ids),
        ];
    }

    /**
     * @param  array<string, mixed>  $inputs
     * @param  string|list<string>|null  $currentJobIds
     * @return array<string, mixed>
     */
    public function redactInputs(array $inputs, string|array|null $currentJobIds): array
    {
        $currentJobIds = $this->normalizeCurrentJobIds($currentJobIds);
        $currentJobIdSet = array_fill_keys($currentJobIds, true);
        $currentJob = $inputs['currentJob'] ?? null;

        if (is_array($currentJob) && ($currentJobIds === [] || isset($currentJobIdSet[(string) ($currentJob['id'] ?? '')]))) {
            $inputs['currentJob'] = null;
        }
        if (is_array($inputs['currentJobs'] ?? null)) {
            $inputs['currentJobs'] = $currentJobIds === []
                ? []
                : array_values(array_filter(
                    $inputs['currentJobs'],
                    static fn (mixed $job): bool => ! is_array($job) || ! isset($currentJobIdSet[(string) ($job['id'] ?? '')]),
                ));
        }
        if (is_array($inputs['hypotheticalJobs'] ?? null)) {
            $inputs['hypotheticalJobs'] = array_map(function (mixed $job) use ($currentJobIdSet): mixed {
                if (! is_array($job) || ! is_array($job['retainedCurrentJobIds'] ?? null)) {
                    return $job;
                }

                $job['retainedCurrentJobIds'] = array_values(array_filter(
                    $job['retainedCurrentJobIds'],
                    static fn (mixed $id): bool => ! isset($currentJobIdSet[(string) $id]),
                ));

                return $job;
            }, $inputs['hypotheticalJobs']);
        }

        return $inputs;
    }

    /**
     * @param  array<string, mixed>|null  $projection
     * @param  string|list<string>|null  $currentJobIds
     * @return array<string, mixed>|null
     */
    public function redactProjection(?array $projection, string|array|null $currentJobIds): ?array
    {
        if ($projection === null) {
            return null;
        }

        $currentJobIds = $this->normalizeCurrentJobIds($currentJobIds);

        // Warnings embed the originating job's name and grant ids, so drop the current job's
        // warnings before its entry is removed (identity-derived tokens, not field names).
        $currentTokens = $this->currentJobTokens($projection, $currentJobIds);
        $currentJobIdSet = array_fill_keys($currentJobIds, true);

        if (isset($projection['jobs']) && is_array($projection['jobs'])) {
            $projection['jobs'] = array_values(array_filter(
                $projection['jobs'],
                fn (mixed $job): bool => ! (is_array($job) && (($job['isCurrent'] ?? false) === true || isset($currentJobIdSet[(string) ($job['id'] ?? '')]))),
            ));
        }

        // The deltas-vs-current column is derived from the current job (delta = job − current),
        // so any survivor would let a viewer back out the redacted current-job dollar values.
        $projection['deltasVsCurrent'] = [];
        $projection['currentJobId'] = null;
        $projection['currentJobIds'] = [];

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
     * @param  list<string>  $currentJobIds
     * @return list<string>
     */
    private function currentJobTokens(array $projection, array $currentJobIds): array
    {
        if (! is_array($projection['jobs'] ?? null)) {
            return [];
        }

        $currentJobIdSet = array_fill_keys($currentJobIds, true);
        $tokens = [];
        foreach ($projection['jobs'] as $job) {
            if (! is_array($job) || (($job['isCurrent'] ?? false) !== true && ! isset($currentJobIdSet[(string) ($job['id'] ?? '')]))) {
                continue;
            }

            if (is_string($job['name'] ?? null) && $job['name'] !== '') {
                $tokens[] = $job['name'];
            }
            if (is_array($job['componentJobNames'] ?? null)) {
                foreach ($job['componentJobNames'] as $name) {
                    if (is_string($name) && $name !== '') {
                        $tokens[] = $name;
                    }
                }
            }

            if (is_array($job['vesting'] ?? null)) {
                foreach ($job['vesting'] as $vesting) {
                    if (is_array($vesting) && is_string($vesting['grantId'] ?? null) && $vesting['grantId'] !== '') {
                        $tokens[] = $vesting['grantId'];
                    }
                }
            }
        }

        return array_values(array_unique($tokens));
    }

    /**
     * @param  string|list<string>|null  $currentJobIds
     * @return list<string>
     */
    private function normalizeCurrentJobIds(string|array|null $currentJobIds): array
    {
        if ($currentJobIds === null) {
            return [];
        }

        $ids = is_array($currentJobIds) ? $currentJobIds : [$currentJobIds];

        return array_values(array_filter(array_map(
            static fn (mixed $id): string => trim((string) $id),
            $ids,
        ), static fn (string $id): bool => $id !== ''));
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
