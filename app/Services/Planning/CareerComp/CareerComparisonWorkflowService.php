<?php

namespace App\Services\Planning\CareerComp;

use App\Models\CareerComparison;
use App\Models\CareerJob;
use App\Models\FinanceTool\FinEquityAwards;
use App\Support\ShortCode;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CareerComparisonWorkflowService
{
    public function __construct(private CareerCompCalculator $calculator) {}

    /**
     * The owner's private "latest" scenario: the row with a NULL short_code (never shared).
     */
    public function latestForUser(int $userId): ?CareerComparison
    {
        return CareerComparison::query()
            ->where('user_id', $userId)
            ->whereNull('short_code')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->first();
    }

    /**
     * Resolve a shared fork by code, treating expired forks as absent.
     */
    public function findActiveShare(string $code): ?CareerComparison
    {
        return CareerComparison::query()
            ->whereNotNull('short_code')
            ->where('short_code', $code)
            ->where(function ($query): void {
                $query->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->first();
    }

    /**
     * Upsert the user's single private latest (NULL short_code) from the given inputs (autosave target).
     */
    public function saveLatest(int $userId, CareerCompInputs $inputs): CareerComparison
    {
        return $this->writeComparison($this->latestForUser($userId), $inputs, $userId, fn (): array => [
            'user_id' => $userId,
            'short_code' => null,
            'share_includes_current' => true,
            'expires_at' => null,
        ]);
    }

    /**
     * Fork the given inputs into a new, link-shareable, editable copy owned by the creator.
     */
    public function createShare(int $userId, CareerCompInputs $inputs, bool $shareIncludesCurrent, ?\DateTimeInterface $expiresAt = null): CareerComparison
    {
        return $this->writeComparison(null, $inputs, $userId, fn (): array => [
            'user_id' => $userId,
            'short_code' => $this->shortCode(),
            'share_includes_current' => $shareIncludesCurrent,
            'expires_at' => $expiresAt,
        ]);
    }

    /**
     * Persist edits made to a shared fork by anyone holding the link. When the editor cannot see the
     * confidential current job, `$preserveCurrent` keeps the stored current job instead of wiping it.
     */
    public function saveShare(CareerComparison $share, CareerCompInputs $inputs, bool $preserveCurrent = false): CareerComparison
    {
        return $this->writeComparison($share, $inputs, $share->user_id !== null ? (int) $share->user_id : null, null, $preserveCurrent);
    }

    public function setShareExpiration(CareerComparison $share, ?\DateTimeInterface $expiresAt): CareerComparison
    {
        $share->update(['expires_at' => $expiresAt]);

        return $share->refresh();
    }

    public function deleteShare(CareerComparison $share): void
    {
        DB::transaction(function () use ($share): void {
            $jobIds = $this->referencedJobIds($share);
            $shareId = $share->id;
            $share->delete();
            $this->deleteOrphanedJobs($jobIds, $shareId);
        });
    }

    /**
     * Create-or-update a comparison from inputs, persisting its jobs and pruning orphans.
     *
     * @param  (callable(): array<string, mixed>)|null  $metaForCreate  Extra columns when creating; null updates $existing.
     */
    private function writeComparison(?CareerComparison $existing, CareerCompInputs $inputs, ?int $jobOwnerId, ?callable $metaForCreate, bool $preserveCurrent = false): CareerComparison
    {
        $projectionInputs = $preserveCurrent && $existing instanceof CareerComparison
            ? $this->withStoredCurrentJob($existing, $inputs)
            : $inputs;
        $projection = $this->calculator->project($projectionInputs)->toArray();

        return DB::transaction(function () use ($existing, $inputs, $jobOwnerId, $metaForCreate, $preserveCurrent, $projection): CareerComparison {
            if ($existing instanceof CareerComparison) {
                $staleJobIds = $this->referencedJobIds($existing);
                if ($preserveCurrent && $existing->current_job_id !== null) {
                    $staleJobIds = array_values(array_filter($staleJobIds, fn (int $id): bool => $id !== (int) $existing->current_job_id));
                }

                $references = $this->persistJobs($inputs, $jobOwnerId, ! $preserveCurrent);
                $currentJobId = $preserveCurrent ? $existing->current_job_id : $references['currentJobId'];

                $existing->update([
                    'title' => $this->workflowTitle($inputs, $existing->title),
                    'current_job_id' => $currentJobId,
                    'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                    'computed_json' => $projection,
                ]);

                $this->deleteOrphanedJobs($staleJobIds, $existing->id);

                return $existing->refresh();
            }

            $references = $this->persistJobs($inputs, $jobOwnerId);

            return CareerComparison::query()->create(array_merge([
                'title' => $this->workflowTitle($inputs, null),
                'is_snapshot' => false,
                'last_active_at' => now(),
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'computed_json' => $projection,
            ], $metaForCreate !== null ? $metaForCreate() : []));
        });
    }

    /**
     * Keep confidential-share projections aligned with the current job that remains stored.
     */
    private function withStoredCurrentJob(CareerComparison $existing, CareerCompInputs $inputs): CareerCompInputs
    {
        $projectionInputs = $inputs->toArray();
        $projectionInputs['currentJob'] = $this->inputsFromComparison($existing)->toArray()['currentJob'] ?? null;

        return CareerCompInputs::fromArray($projectionInputs);
    }

    /**
     * @param  array<string, mixed>|null  $baseCurrentJob
     * @return array{currentJob: array<string, mixed>, importedGrants: list<array<string, mixed>>}
     */
    public function importRsuCurrentJob(int $userId, ?array $baseCurrentJob): array
    {
        $currentJob = JobSpec::nullableFromArray($baseCurrentJob, true)?->toArray() ?? JobSpec::defaults(true);
        $grants = $this->rsuGrantsForUser($userId);

        $currentJob['rsuGrants'] = $grants;

        if ($grants !== []) {
            $prices = array_values(array_filter(array_map(
                fn (array $grant): ?float => is_numeric($grant['grantPrice'] ?? null) ? (float) $grant['grantPrice'] : null,
                $grants,
            )));

            if ($prices !== []) {
                $currentJob['company']['currentSharePrice'] = round(array_sum($prices) / count($prices), 2);
            }
        }

        return ['currentJob' => $currentJob, 'importedGrants' => $grants];
    }

    public function inputsFromComparison(CareerComparison $comparison): CareerCompInputs
    {
        $currentJob = $comparison->current_job_id !== null
            ? CareerJob::query()->find($comparison->current_job_id)
            : null;

        $hypothetical = CareerJob::query()
            ->whereIn('id', $comparison->hypothetical_job_ids)
            ->get()
            ->keyBy('id');

        $computed = $comparison->computed_json ?? [];
        $defaults = CareerCompInputs::defaults();

        $hypotheticalSpecs = [];
        foreach ($comparison->hypothetical_job_ids as $id) {
            $job = $hypothetical->get($id);
            if ($job instanceof CareerJob) {
                $hypotheticalSpecs[] = $job->spec_json;
            }
        }

        return CareerCompInputs::fromArray([
            'startYear' => $computed['startYear'] ?? $defaults['startYear'],
            'horizonYears' => $computed['horizonYears'] ?? $defaults['horizonYears'],
            'currentJob' => $currentJob?->spec_json,
            'hypotheticalJobs' => $hypotheticalSpecs,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    public function response(CareerComparison $comparison): array
    {
        return [
            'id' => $comparison->id,
            'title' => $comparison->title,
            'shortCode' => $comparison->short_code,
            'shareUrl' => $comparison->short_code !== null ? url("/financial-planning/career-comparison/s/{$comparison->short_code}") : null,
            'ownerUserId' => $comparison->user_id,
            'shareIncludesCurrent' => $comparison->share_includes_current,
            'expiresAt' => $comparison->expires_at?->toIso8601String(),
            'updatedAt' => $comparison->updated_at?->toIso8601String(),
            'inputs' => $this->inputsFromComparison($comparison)->toArray(),
            'projection' => $comparison->computed_json,
        ];
    }

    /**
     * @return array{currentJobId: int|null, hypotheticalJobIds: list<int>}
     */
    private function persistJobs(CareerCompInputs $inputs, ?int $userId, bool $persistCurrent = true): array
    {
        $currentJob = $persistCurrent ? $inputs->currentJob() : null;
        $currentJobId = null;

        if ($currentJob !== null) {
            $currentJobId = CareerJob::query()->create([
                'user_id' => $userId,
                'kind' => 'current',
                'name' => $currentJob->name(),
                'spec_json' => $currentJob->toArray(),
            ])->id;
        }

        $hypotheticalJobIds = [];

        foreach ($inputs->hypotheticalJobs() as $job) {
            $hypotheticalJobIds[] = CareerJob::query()->create([
                'user_id' => $userId,
                'kind' => 'hypothetical',
                'name' => $job->name(),
                'spec_json' => $job->toArray(),
            ])->id;
        }

        return ['currentJobId' => $currentJobId, 'hypotheticalJobIds' => $hypotheticalJobIds];
    }

    /**
     * @return list<int>
     */
    private function referencedJobIds(CareerComparison $comparison): array
    {
        $ids = $comparison->current_job_id !== null ? [(int) $comparison->current_job_id] : [];

        foreach ($comparison->hypothetical_job_ids as $id) {
            $ids[] = (int) $id;
        }

        return $ids;
    }

    /**
     * @param  list<int>  $jobIds
     */
    private function deleteOrphanedJobs(array $jobIds, int $keepComparisonId): void
    {
        if ($jobIds === []) {
            return;
        }

        $referenced = [];
        CareerComparison::query()
            ->where('id', '!=', $keepComparisonId)
            ->get(['current_job_id', 'hypothetical_job_ids'])
            ->each(function (CareerComparison $other) use (&$referenced): void {
                if ($other->current_job_id !== null) {
                    $referenced[(int) $other->current_job_id] = true;
                }

                foreach ($other->hypothetical_job_ids as $id) {
                    $referenced[(int) $id] = true;
                }
            });

        $deletable = array_values(array_filter($jobIds, fn (int $id): bool => ! isset($referenced[$id])));

        if ($deletable !== []) {
            CareerJob::query()->whereIn('id', $deletable)->delete();
        }
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rsuGrantsForUser(int $userId): array
    {
        $awards = FinEquityAwards::query()
            ->where('uid', $userId)
            ->orderBy('grant_date')
            ->orderBy('award_id')
            ->orderBy('vest_date')
            ->get()
            ->groupBy(fn (FinEquityAwards $award): string => implode('|', [
                (string) $award->award_id,
                (string) $award->grant_date,
                (string) $award->symbol,
            ]));

        $grants = [];

        foreach ($awards as $group) {
            $first = $group->first();
            if (! $first instanceof FinEquityAwards) {
                continue;
            }

            $shareCount = (float) $group->sum(fn (FinEquityAwards $award): float => (float) $award->share_count);
            $grantDate = (string) $first->grant_date;
            $lastVestDate = (string) $group->max('vest_date');
            $vestingYears = max(1, (int) ceil((strtotime($lastVestDate) - strtotime($grantDate)) / 31556952));

            $grantPrice = $group
                ->map(fn (FinEquityAwards $award): ?float => $award->grant_price !== null ? (float) $award->grant_price : null)
                ->filter(fn (?float $price): bool => $price !== null)
                ->avg();

            $grants[] = [
                'id' => 'rsu-tool-'.preg_replace('/[^A-Za-z0-9_-]+/', '-', strtolower((string) $first->award_id ?: (string) $first->id)),
                'kind' => 'hire',
                'grantDate' => $grantDate,
                'shareCount' => $shareCount,
                'grantValue' => null,
                'grantPrice' => $grantPrice !== null ? round((float) $grantPrice, 2) : null,
                'cliffMonths' => 0,
                'vestingYears' => $vestingYears,
                'vestingFrequency' => $this->inferVestingFrequency($group),
            ];
        }

        return $grants;
    }

    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     */
    private function inferVestingFrequency(Collection $awards): string
    {
        $count = $awards->count();

        if ($count <= 1) {
            return 'annual';
        }

        $vestingYears = max(1, (int) ceil((strtotime((string) $awards->max('vest_date')) - strtotime((string) $awards->min('vest_date'))) / 31556952));
        $vestsPerYear = $count / $vestingYears;

        if ($vestsPerYear <= 1.5) {
            return 'annual';
        }

        if ($vestsPerYear <= 5) {
            return 'quarterly';
        }

        return 'monthly';
    }

    private function workflowTitle(CareerCompInputs $inputs, ?string $title): string
    {
        $trimmed = trim((string) $title);

        if ($trimmed !== '') {
            return $trimmed;
        }

        return (string) ($inputs->value('currentJob.name') ?: 'Career comparison');
    }

    private function shortCode(): string
    {
        return ShortCode::generate(
            fn (string $code): bool => CareerComparison::query()->where('short_code', $code)->exists(),
        );
    }
}
