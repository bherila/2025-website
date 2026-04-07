<?php

namespace App\Services\Finance;

use App\Models\FinanceTool\FinAccountTag;
use Illuminate\Support\Facades\DB;

class ScheduleCSummaryService
{
    /**
     * Returns Schedule C totals grouped by year and tax characteristic.
     *
     * @return array{available_years: array<int, string>, years: array<int, array<string, mixed>>, entities: array<int, array{id: int, display_name: string, type: string}>}
     */
    public function getSummary(int $userId, ?int $yearFilter = null): array
    {
        $tags = FinAccountTag::where('tag_userid', $userId)
            ->whereNull('when_deleted')
            ->whereNotNull('tax_characteristic')
            ->where('tax_characteristic', '!=', '')
            ->where('tax_characteristic', '!=', 'none')
            ->get(['tag_id', 'tax_characteristic', 'employment_entity_id']);

        if ($tags->isEmpty()) {
            return ['available_years' => [], 'years' => [], 'entities' => []];
        }

        $tagIds = $tags->pluck('tag_id');
        $tagCharacteristicMap = $tags->pluck('tax_characteristic', 'tag_id');
        $tagEntityMap = $tags->pluck('employment_entity_id', 'tag_id');

        $entityIds = $tags->pluck('employment_entity_id')->filter()->unique()->values();
        $entities = [];
        if ($entityIds->isNotEmpty()) {
            $entities = DB::table('fin_employment_entity')
                ->whereIn('id', $entityIds->toArray())
                ->where('user_id', $userId)
                ->get(['id', 'display_name', 'type'])
                ->keyBy('id')
                ->toArray();
        }

        // Fetch available years using a lightweight distinct query
        $availableYears = DB::table('fin_account_line_items as li')
            ->join('fin_account_line_item_tag_map as tm', function ($join) {
                $join->on('li.t_id', '=', 'tm.t_id')
                    ->whereNull('tm.when_deleted');
            })
            ->join('fin_account_tag as t', function ($join) use ($tagIds) {
                $join->on('tm.tag_id', '=', 't.tag_id')
                    ->whereIn('t.tag_id', $tagIds->toArray());
            })
            ->join('fin_accounts as a', 'li.t_account', '=', 'a.acct_id')
            ->where('a.acct_owner', $userId)
            ->selectRaw("DISTINCT SUBSTRING(li.t_date, 1, 4) as year")
            ->orderByRaw("year DESC")
            ->pluck('year')
            ->toArray();

        $query = DB::table('fin_account_line_items as li')
            ->join('fin_account_line_item_tag_map as tm', function ($join) {
                $join->on('li.t_id', '=', 'tm.t_id')
                    ->whereNull('tm.when_deleted');
            })
            ->join('fin_account_tag as t', function ($join) use ($tagIds) {
                $join->on('tm.tag_id', '=', 't.tag_id')
                    ->whereIn('t.tag_id', $tagIds->toArray());
            })
            ->join('fin_accounts as a', 'li.t_account', '=', 'a.acct_id')
            ->where('a.acct_owner', $userId)
            ->select('li.t_id', 'li.t_date', 'li.t_description', 'li.t_amt', 'li.t_account', 't.tag_id')
            ->orderBy('li.t_date');

        // Apply year filter at DB level when provided so only the requested year's rows are fetched
        if ($yearFilter !== null) {
            $query->where(DB::raw("SUBSTRING(li.t_date, 1, 4)"), '=', (string) $yearFilter);
        }

        $rows = $query->get();

        $categoryKeyMap = [
            'sch_c_income' => 'schedule_c_income',
            'sch_c_expense' => 'schedule_c_expense',
            'sch_c_home_office' => 'schedule_c_home_office',
        ];

        $byYear = [];
        foreach ($rows as $row) {
            $year = substr($row->t_date, 0, 4);
            $taxChar = $tagCharacteristicMap[$row->tag_id] ?? null;
            if (! $taxChar) {
                continue;
            }

            $meta = FinAccountTag::TAX_CHARACTERISTICS[$taxChar] ?? null;
            if (! $meta) {
                continue;
            }

            if (isset($categoryKeyMap[$meta['category']])) {
                $key = $categoryKeyMap[$meta['category']];
            } elseif ($meta['category'] === 'other') {
                $key = 'ordinary_income';
            } elseif ($meta['category'] === 'w2_income') {
                $key = 'w2_income';
            } else {
                continue;
            }

            $amount = in_array($meta['category'], ['sch_c_income', 'other', 'w2_income'], true)
                ? (float) $row->t_amt
                : abs((float) $row->t_amt);

            $entityId = $tagEntityMap[$row->tag_id] ?? null;
            $entityKey = $entityId ?? 'unassigned';

            if (! isset($byYear[$year])) {
                $byYear[$year] = [];
            }

            if (! isset($byYear[$year][$entityKey])) {
                $entityName = $entityId && isset($entities[$entityId])
                    ? $entities[$entityId]->display_name
                    : null;

                $byYear[$year][$entityKey] = [
                    'entity_id' => $entityId,
                    'entity_name' => $entityName,
                    'schedule_c_income' => [],
                    'schedule_c_expense' => [],
                    'schedule_c_home_office' => [],
                    'ordinary_income' => [],
                    'w2_income' => [],
                ];
            }

            if (! isset($byYear[$year][$entityKey][$key][$taxChar])) {
                $byYear[$year][$entityKey][$key][$taxChar] = ['label' => $meta['label'], 'total' => 0.0, 'transactions' => []];
            }

            $byYear[$year][$entityKey][$key][$taxChar]['total'] += $amount;
            $byYear[$year][$entityKey][$key][$taxChar]['transactions'][] = [
                't_id' => $row->t_id,
                't_date' => substr($row->t_date, 0, 10),
                't_description' => $row->t_description,
                't_amt' => (float) $row->t_amt,
                't_account' => $row->t_account,
            ];
        }

        krsort($byYear);

        $result = [];
        foreach ($byYear as $year => $entitiesData) {
            $result[] = [
                'year' => (int) $year,
                'entities' => array_values($entitiesData),
            ];
        }

        /** @var array<int, array{id: int, display_name: string, type: string}> $entityList */
        $entityList = array_map(
            fn ($entity) => ['id' => $entity->id, 'display_name' => $entity->display_name, 'type' => $entity->type],
            array_values($entities),
        );

        return [
            'available_years' => $availableYears,
            'years' => $result,
            'entities' => $entityList,
        ];
    }

    /**
     * @return int[]
     */
    public function availableYears(int $userId): array
    {
        $tags = FinAccountTag::where('tag_userid', $userId)
            ->whereNull('when_deleted')
            ->whereNotNull('tax_characteristic')
            ->where('tax_characteristic', '!=', '')
            ->where('tax_characteristic', '!=', 'none')
            ->pluck('tag_id');

        if ($tags->isEmpty()) {
            return [];
        }

        return DB::table('fin_account_line_items as li')
            ->join('fin_account_line_item_tag_map as tm', function ($join) {
                $join->on('li.t_id', '=', 'tm.t_id')
                    ->whereNull('tm.when_deleted');
            })
            ->join('fin_account_tag as t', function ($join) use ($tags) {
                $join->on('tm.tag_id', '=', 't.tag_id')
                    ->whereIn('t.tag_id', $tags->toArray());
            })
            ->join('fin_accounts as a', 'li.t_account', '=', 'a.acct_id')
            ->where('a.acct_owner', $userId)
            ->selectRaw("DISTINCT SUBSTRING(li.t_date, 1, 4) as year")
            ->orderByRaw("year DESC")
            ->pluck('year')
            ->map(static fn (string $year): int => (int) $year)
            ->toArray();
    }
}
