<?php

namespace App\Services\Planning\CareerComp;

use App\Models\CareerComparison;
use App\Models\CareerJob;
use App\Models\FinanceTool\FinEquityAwards;
use App\Services\Finance\MoneyMath;
use App\Support\ShortCode;
use DateTimeImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CareerComparisonWorkflowService
{
    public function __construct(
        private CareerCompCalculator $calculator,
        private ComparisonShareRedactor $shareRedactor,
    ) {}

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

    public function createWorkflow(int $userId, CareerCompInputs $inputs, ?string $title = null, bool $shareIncludesCurrent = true): CareerComparison
    {
        $projection = $this->calculator->project($inputs)->toArray();

        return DB::transaction(function () use ($userId, $inputs, $projection, $title, $shareIncludesCurrent): CareerComparison {
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
                'share_includes_current' => $shareIncludesCurrent,
                'computed_json' => $projection,
            ]);
        });
    }

    /**
     * Promote a claimed anonymous comparison/snapshot into an editable, owned
     * workflow: assign ownership, flip it out of snapshot mode so it appears in
     * the user's workflow list, mark it last-active, and adopt any unowned jobs
     * it references.
     *
     * @param  list<int>  $referencedJobIds
     */
    public function claim(CareerComparison $comparison, int $userId, array $referencedJobIds): CareerComparison
    {
        return DB::transaction(function () use ($comparison, $userId, $referencedJobIds): CareerComparison {
            $this->clearLastActive($userId);
            $comparison->update([
                'user_id' => $userId,
                'is_snapshot' => false,
                'last_active_at' => now(),
            ]);

            if ($referencedJobIds !== []) {
                CareerJob::query()
                    ->whereIn('id', $referencedJobIds)
                    ->whereNull('user_id')
                    ->update(['user_id' => $userId]);
            }

            return $comparison->refresh();
        });
    }

    public function updateWorkflow(CareerComparison $workflow, CareerCompInputs $inputs, ?string $title = null, ?bool $shareIncludesCurrent = null): CareerComparison
    {
        $projection = $this->calculator->project($inputs)->toArray();

        return DB::transaction(function () use ($workflow, $inputs, $projection, $title, $shareIncludesCurrent): CareerComparison {
            $userId = (int) $workflow->user_id;
            $staleJobIds = $this->referencedJobIds($workflow);
            $references = $this->persistJobs($inputs, $userId);

            // Editing a workflow makes it the one to auto-load next visit, so it
            // becomes last-active (matching markLastActive's clear-then-set).
            $this->clearLastActive($userId);
            $workflow->update([
                'title' => $this->workflowTitle($inputs, $title ?? $workflow->title),
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'share_includes_current' => $shareIncludesCurrent ?? $workflow->share_includes_current,
                'last_active_at' => now(),
                'computed_json' => $projection,
            ]);

            $this->deleteOrphanedJobs($staleJobIds, $workflow->id, $userId);

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
            $userId = (int) $workflow->user_id;
            $workflow->delete();
            $this->deleteOrphanedJobs($jobIds, $workflowId, $userId);
        });
    }

    public function createSnapshot(?int $userId, CareerCompInputs $inputs, bool $shareIncludesCurrent = true): CareerComparison
    {
        $projection = $this->calculator->project($inputs)->toArray();

        return DB::transaction(function () use ($userId, $inputs, $projection, $shareIncludesCurrent): CareerComparison {
            // A confidential ("hide current") snapshot must never store the
            // current job's dollar values at rest: a leaked 7-char short_code
            // would otherwise expose them regardless of read-time redaction.
            // So we drop the current job entirely — both its career_jobs row
            // (current_job_id stays null) and its entry + derived deltas in the
            // stored projection.
            if ($shareIncludesCurrent) {
                $references = $this->persistJobs($inputs, $userId);
                $storedProjection = $projection;
            } else {
                $references = $this->persistJobs($inputs, $userId, includeCurrent: false);
                $currentJobId = is_string($projection['currentJobId'] ?? null)
                    ? $projection['currentJobId']
                    : $inputs->currentJob()?->id();
                $storedProjection = $this->shareRedactor->redactProjection($projection, $currentJobId);
            }

            return CareerComparison::query()->create([
                'user_id' => $userId,
                'title' => null,
                'is_snapshot' => true,
                'last_active_at' => null,
                'current_job_id' => $references['currentJobId'],
                'hypothetical_job_ids' => $references['hypotheticalJobIds'],
                'short_code' => $this->shortCode(),
                'share_includes_current' => $shareIncludesCurrent,
                'computed_json' => $storedProjection,
            ]);
        });
    }

    /**
     * Import the user's RSU-tool equity awards into a Career Comparison current
     * job's equity inputs.
     *
     * Mapping assumptions (the RSU tool stores one fin_equity_awards row per vest
     * tranche, keyed uid+award_id+grant_date+vest_date+symbol, so a grant's full
     * schedule — future tranches included — is recoverable):
     *  - Rows are grouped into one Career Comparison RSU grant per award_id +
     *    grant_date + symbol.
     *  - shareCount = sum of the group's tranche share counts (the whole grant).
     *  - grantDate = the group's grant_date.
     *  - cliffMonths = whole months from grant_date to the first vest_date, which
     *    reconstructs the real cliff (e.g. a 1-year cliff → 12).
     *  - vestingYears = grant_date → last vest_date, rounded to whole years.
     *  - vestingFrequency = inferred from the typical gap between vest dates.
     *  - kind = 'hire' for every grant: the RSU tool does not distinguish hire vs
     *    refresher grants, and kind is presentation-only for RSUs.
     *  - currentSharePrice (company-level, go-forward price) is filled only when
     *    the user has not set one, preferring the most recent market price at vest
     *    (vest_price) over the historical grant cost basis.
     *
     * Unrelated current-job fields (cash comp, company identity, options) are
     * preserved from $baseCurrentJob and never overwritten.
     *
     * @param  array<string, mixed>|null  $baseCurrentJob
     * @return array{currentJob: array<string, mixed>, importedGrants: list<array<string, mixed>>}
     */
    public function importRsuCurrentJob(int $userId, ?array $baseCurrentJob): array
    {
        $currentJob = JobSpec::nullableFromArray($baseCurrentJob, true)?->toArray() ?? JobSpec::defaults(true);
        $awards = $this->equityAwardsForUser($userId);
        $grants = $this->rsuGrantsFromAwards($awards);

        $currentJob['rsuGrants'] = $grants;

        if ($grants !== [] && (float) ($currentJob['company']['currentSharePrice'] ?? 0.0) <= 0.0) {
            $currentSharePrice = $this->currentSharePriceFromAwards($awards);

            if ($currentSharePrice !== null) {
                $currentJob['company']['currentSharePrice'] = $currentSharePrice;
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
    private function persistJobs(CareerCompInputs $inputs, ?int $userId, bool $includeCurrent = true): array
    {
        $currentJob = $includeCurrent ? $inputs->currentJob() : null;
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
     * Delete the given jobs unless another of the same user's comparisons still
     * references them. The candidate jobs were created with user_id=$userId, so
     * only that user's comparisons can reference them — scoping the lookup keeps
     * this bounded instead of scanning the whole table on every mutation.
     *
     * @param  list<int>  $jobIds
     */
    private function deleteOrphanedJobs(array $jobIds, int $keepComparisonId, int $userId): void
    {
        if ($jobIds === []) {
            return;
        }

        $referenced = [];
        CareerComparison::query()
            ->where('user_id', $userId)
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
     * @return Collection<int, FinEquityAwards>
     */
    private function equityAwardsForUser(int $userId): Collection
    {
        return FinEquityAwards::query()
            ->where('uid', $userId)
            ->orderBy('grant_date')
            ->orderBy('award_id')
            ->orderBy('vest_date')
            ->get();
    }

    /**
     * @param  Collection<int, FinEquityAwards>  $awards
     * @return list<array<string, mixed>>
     */
    private function rsuGrantsFromAwards(Collection $awards): array
    {
        $grouped = $awards->groupBy(fn (FinEquityAwards $award): string => implode('|', [
            (string) $award->award_id,
            (string) $award->grant_date,
            (string) $award->symbol,
        ]));

        $grants = [];

        foreach ($grouped as $group) {
            $first = $group->first();
            if (! $first instanceof FinEquityAwards) {
                continue;
            }

            $grantDate = (string) $first->grant_date;
            $shareCount = (float) $group->sum(fn (FinEquityAwards $award): float => (float) $award->share_count);

            $vestDates = $group
                ->map(fn (FinEquityAwards $award): string => (string) $award->vest_date)
                ->filter(fn (string $date): bool => $date !== '')
                ->sort()
                ->values()
                ->all();

            $firstVest = $vestDates[0] ?? null;
            $lastVest = $vestDates !== [] ? $vestDates[array_key_last($vestDates)] : null;

            $cliffMonths = $firstVest !== null ? $this->monthsBetween($grantDate, $firstVest) : 0;
            $vestingYears = $lastVest !== null
                ? max(1, (int) round($this->monthsBetween($grantDate, $lastVest) / 12))
                : 1;

            $grantPrice = $group
                ->map(fn (FinEquityAwards $award): ?float => $award->grant_price !== null ? (float) $award->grant_price : null)
                ->first(fn (?float $price): bool => $price !== null);

            $grants[] = [
                'id' => 'rsu-tool-'.preg_replace('/[^A-Za-z0-9_-]+/', '-', strtolower((string) $first->award_id ?: (string) $first->id)),
                'kind' => 'hire',
                'grantDate' => $grantDate,
                'shareCount' => $shareCount,
                'grantValue' => null,
                'grantPrice' => $grantPrice !== null ? MoneyMath::round($grantPrice) : null,
                'cliffMonths' => $cliffMonths,
                'vestingYears' => $vestingYears,
                'vestingFrequency' => $this->inferVestingFrequency($vestDates),
            ];
        }

        return $grants;
    }

    /**
     * Best-effort go-forward share price: the most recent market price at vest
     * (vest_price), else the most recent grant price as a fallback. Returns null
     * when neither is available.
     *
     * @param  Collection<int, FinEquityAwards>  $awards
     */
    private function currentSharePriceFromAwards(Collection $awards): ?float
    {
        $latestVestPrice = $awards
            ->filter(fn (FinEquityAwards $award): bool => $award->vest_price !== null)
            ->sortByDesc(fn (FinEquityAwards $award): string => (string) $award->vest_date)
            ->first();

        if ($latestVestPrice instanceof FinEquityAwards && $latestVestPrice->vest_price !== null) {
            return MoneyMath::round((float) $latestVestPrice->vest_price);
        }

        $latestGrantPrice = $awards
            ->filter(fn (FinEquityAwards $award): bool => $award->grant_price !== null)
            ->sortByDesc(fn (FinEquityAwards $award): string => (string) $award->grant_date)
            ->first();

        if ($latestGrantPrice instanceof FinEquityAwards && $latestGrantPrice->grant_price !== null) {
            return MoneyMath::round((float) $latestGrantPrice->grant_price);
        }

        return null;
    }

    /**
     * Infer a vesting cadence from the typical gap between consecutive vest
     * dates (the grant→first-vest cliff is excluded, so a 1-year cliff does not
     * masquerade as annual cadence). Single-tranche grants default to annual.
     *
     * @param  list<string>  $vestDates  ascending Y-m-d vest dates
     */
    private function inferVestingFrequency(array $vestDates): string
    {
        $count = count($vestDates);

        if ($count <= 1) {
            return 'annual';
        }

        $gaps = [];
        for ($i = 1; $i < $count; $i++) {
            $gaps[] = $this->monthsBetween($vestDates[$i - 1], $vestDates[$i]);
        }

        sort($gaps);
        $medianGap = $gaps[intdiv(count($gaps) - 1, 2)];

        if ($medianGap <= 2) {
            return 'monthly';
        }

        if ($medianGap <= 6) {
            return 'quarterly';
        }

        return 'annual';
    }

    /**
     * Whole months between two Y-m-d dates, rounded to the nearest month (real
     * vest dates fall on exact monthly anniversaries; this tolerates day drift).
     * Returns 0 when either date is unparseable or $to precedes $from.
     */
    private function monthsBetween(string $from, string $to): int
    {
        $start = DateTimeImmutable::createFromFormat('!Y-m-d', $from);
        $end = DateTimeImmutable::createFromFormat('!Y-m-d', $to);

        if (! $start instanceof DateTimeImmutable || ! $end instanceof DateTimeImmutable || $end < $start) {
            return 0;
        }

        $diff = $start->diff($end);
        $months = $diff->y * 12 + $diff->m;

        return $diff->d >= 15 ? $months + 1 : $months;
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
