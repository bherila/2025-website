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
    /**
     * The current share price the form seeds when a user clicks "Add current job". An RSU import
     * should overwrite this untouched placeholder with the imported price; it is mirrored from the
     * frontend default in `resources/js/components/planning/CareerComp/defaults.ts` (`buildDefaultJob`)
     * and must be kept in sync if that default changes.
     */
    private const PLACEHOLDER_CURRENT_SHARE_PRICE = 25.0;

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
     *
     * Only rows deliberately published as shares (`is_snapshot = true`) are reachable. The owner's
     * private "latest" (NULL short_code) and any legacy pre-share private workflow row — which
     * carried a code but was never published (`is_snapshot = false`) — are excluded by construction,
     * so an old comparison URL can never be used to read or mutate a user's private scenario.
     */
    public function findActiveShare(string $code): ?CareerComparison
    {
        return CareerComparison::query()
            ->whereNotNull('short_code')
            ->where('short_code', $code)
            ->where('is_snapshot', true)
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
            'is_snapshot' => true,
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
            $ownerId = $share->user_id !== null ? (int) $share->user_id : null;
            $share->delete();
            $this->deleteOrphanedJobs($jobIds, $shareId, $ownerId);
        });
    }

    /**
     * Create-or-update a comparison from inputs, persisting its jobs and pruning orphans.
     *
     * @param  (callable(): array<string, mixed>)|null  $metaForCreate  Extra columns when creating; null updates $existing.
     */
    private function writeComparison(?CareerComparison $existing, CareerCompInputs $inputs, ?int $jobOwnerId, ?callable $metaForCreate, bool $preserveCurrent = false): CareerComparison
    {
        // When preserving a confidential current job the editor could not see, the submitted inputs
        // carry `currentJob: null`. Re-hydrate the stored current job before projecting so the saved
        // computed_json (currentJobId + deltas-vs-current) stays consistent with the preserved
        // `current_job_id`, instead of being recorded as a no-current-job scenario.
        $projection = $this->calculator->project($this->projectionInputs($existing, $inputs, $preserveCurrent))->toArray();

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

                $this->deleteOrphanedJobs($staleJobIds, $existing->id, $jobOwnerId);

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
     * Inputs to project from: identical to the submitted inputs, except a preserved confidential
     * current job (redacted to null in the submission) is re-hydrated from the stored row so the
     * projection matches the `current_job_id` the save keeps.
     */
    private function projectionInputs(?CareerComparison $existing, CareerCompInputs $inputs, bool $preserveCurrent): CareerCompInputs
    {
        if (! $preserveCurrent || ! $existing instanceof CareerComparison || $existing->current_job_id === null) {
            return $inputs;
        }

        $storedCurrent = CareerJob::query()->find($existing->current_job_id);

        if (! $storedCurrent instanceof CareerJob) {
            return $inputs;
        }

        return CareerCompInputs::fromArray(array_replace($inputs->toArray(), [
            'currentJob' => $storedCurrent->spec_json,
        ]));
    }

    /**
     * @param  array<string, mixed>|null  $baseCurrentJob
     * @return array{currentJob: array<string, mixed>, importedGrants: list<array<string, mixed>>}
     */
    public function importRsuCurrentJob(int $userId, ?array $baseCurrentJob): array
    {
        $currentJob = JobSpec::nullableFromArray($baseCurrentJob, true)?->toArray() ?? JobSpec::defaults(true);
        $awards = $this->equityAwardsForUser($userId);
        $grants = $this->rsuGrantsFromAwards($awards);

        $currentJob['rsuGrants'] = $grants;

        if ($grants !== [] && $this->shouldImportCurrentSharePrice($currentJob)) {
            $currentSharePrice = $this->currentSharePriceFromAwards($awards);

            if ($currentSharePrice !== null) {
                $currentJob['company']['currentSharePrice'] = $currentSharePrice;
            }
        }

        return ['currentJob' => $currentJob, 'importedGrants' => $grants];
    }

    /**
     * Whether an RSU import may fill in the go-forward share price. It does so only when the field
     * is empty/zero or still holds the untouched form placeholder, so a price the user actually
     * entered is preserved. A genuine price that happens to equal the placeholder is the one
     * accepted ambiguity of this value-based heuristic.
     *
     * @param  array<string, mixed>  $currentJob
     */
    private function shouldImportCurrentSharePrice(array $currentJob): bool
    {
        $currentPrice = (float) ($currentJob['company']['currentSharePrice'] ?? 0.0);

        return $currentPrice <= 0.0
            || abs($currentPrice - self::PLACEHOLDER_CURRENT_SHARE_PRICE) < 0.000001;
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
     * Prune jobs from $jobIds that no longer back any comparison. Jobs are owner-scoped
     * (persistJobs stamps user_id), so a job created for a given owner can only be referenced
     * by that owner's comparisons — scanning only the owner's rows is both correct and avoids a
     * full-table scan.
     *
     * @param  list<int>  $jobIds
     */
    private function deleteOrphanedJobs(array $jobIds, int $keepComparisonId, ?int $userId): void
    {
        if ($jobIds === []) {
            return;
        }

        $referenced = [];
        CareerComparison::query()
            ->when($userId !== null, fn ($query) => $query->where('user_id', $userId), fn ($query) => $query->whereNull('user_id'))
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
                ? $this->vestingYearsFromMonths($this->monthsBetween($grantDate, $lastVest))
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

    private function vestingYearsFromMonths(int $months): int|float
    {
        $months = max(3, $months);

        return $months % 12 === 0
            ? (int) ($months / 12)
            : round($months / 12, 4);
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
