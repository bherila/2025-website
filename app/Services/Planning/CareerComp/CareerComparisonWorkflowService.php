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
     * @return Collection<int, CareerComparison>
     */
    public function listWorkflows(int $userId): Collection
    {
        return CareerComparison::query()
            ->where('user_id', $userId)
            ->where('is_snapshot', false)
            ->orderByDesc('last_active_at')
            ->orderByDesc('updated_at')
            ->orderByDesc('id')
            ->get();
    }

    public function lastActiveWorkflow(int $userId): ?CareerComparison
    {
        return CareerComparison::query()
            ->where('user_id', $userId)
            ->where('is_snapshot', false)
            ->orderByDesc('last_active_at')
            ->orderByDesc('updated_at')
            ->first();
    }

    public function createWorkflow(int $userId, CareerCompInputs $inputs, ?string $title = null): CareerComparison
    {
        $projection = $this->calculator->project($inputs)->toArray();

        return DB::transaction(function () use ($userId, $inputs, $projection, $title): CareerComparison {
            $this->clearLastActive($userId);
            $references = $this->persistJobs($inputs, $userId);

            return CareerComparison::query()->create([
                'user_id' => $userId,
                'title' => $this->workflowTitle($inputs, $title),
                'is_snapshot' => false,
                'last_active_at' => now(),
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'short_code' => $this->shortCode(),
                'share_includes_current' => true,
                'computed_json' => $projection,
            ]);
        });
    }

    public function updateWorkflow(CareerComparison $workflow, CareerCompInputs $inputs, ?string $title = null, ?bool $shareIncludesCurrent = null): CareerComparison
    {
        $projection = $this->calculator->project($inputs)->toArray();

        return DB::transaction(function () use ($workflow, $inputs, $projection, $title, $shareIncludesCurrent): CareerComparison {
            $staleJobIds = $this->referencedJobIds($workflow);
            $references = $this->persistJobs($inputs, (int) $workflow->user_id);

            $workflow->update([
                'title' => $this->workflowTitle($inputs, $title ?? $workflow->title),
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'share_includes_current' => $shareIncludesCurrent ?? $workflow->share_includes_current,
                'computed_json' => $projection,
            ]);

            $this->deleteOrphanedJobs($staleJobIds, $workflow->id);

            return $workflow->refresh();
        });
    }

    public function markLastActive(CareerComparison $workflow): CareerComparison
    {
        return DB::transaction(function () use ($workflow): CareerComparison {
            $this->clearLastActive((int) $workflow->user_id);
            $workflow->update(['last_active_at' => now()]);

            return $workflow->refresh();
        });
    }

    public function deleteWorkflow(CareerComparison $workflow): void
    {
        DB::transaction(function () use ($workflow): void {
            $jobIds = $this->referencedJobIds($workflow);
            $workflowId = $workflow->id;
            $workflow->delete();
            $this->deleteOrphanedJobs($jobIds, $workflowId);
        });
    }

    public function createSnapshot(?int $userId, CareerCompInputs $inputs, bool $shareIncludesCurrent = true): CareerComparison
    {
        $projection = $this->calculator->project($inputs)->toArray();

        return DB::transaction(function () use ($userId, $inputs, $projection, $shareIncludesCurrent): CareerComparison {
            $references = $this->persistJobs($inputs, $userId);

            return CareerComparison::query()->create([
                'user_id' => $userId,
                'title' => null,
                'is_snapshot' => true,
                'last_active_at' => null,
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'short_code' => $this->shortCode(),
                'share_includes_current' => $shareIncludesCurrent,
                'computed_json' => $projection,
            ]);
        });
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
            'shareUrl' => url("/financial-planning/career-comparison/s/{$comparison->short_code}"),
            'ownerUserId' => $comparison->user_id,
            'shareIncludesCurrent' => $comparison->share_includes_current,
            'isSnapshot' => $comparison->is_snapshot,
            'lastActiveAt' => $comparison->last_active_at?->toIso8601String(),
            'updatedAt' => $comparison->updated_at?->toIso8601String(),
            'inputs' => $this->inputsFromComparison($comparison)->toArray(),
            'projection' => $comparison->computed_json,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function summary(CareerComparison $comparison): array
    {
        return [
            'id' => $comparison->id,
            'title' => $comparison->title,
            'shortCode' => $comparison->short_code,
            'lastActiveAt' => $comparison->last_active_at?->toIso8601String(),
            'updatedAt' => $comparison->updated_at?->toIso8601String(),
        ];
    }

    private function clearLastActive(int $userId): void
    {
        CareerComparison::query()
            ->where('user_id', $userId)
            ->where('is_snapshot', false)
            ->whereNotNull('last_active_at')
            ->update(['last_active_at' => null]);
    }

    /**
     * @return array{currentJobId: int|null, hypotheticalJobIds: list<int>}
     */
    private function persistJobs(CareerCompInputs $inputs, ?int $userId): array
    {
        $currentJob = $inputs->currentJob();
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
