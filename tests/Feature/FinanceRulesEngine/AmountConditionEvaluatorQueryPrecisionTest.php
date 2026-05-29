<?php

namespace Tests\Feature\FinanceRulesEngine;

use App\Finance\RulesEngine\Conditions\AmountConditionEvaluator;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Tests\TestCase;

class AmountConditionEvaluatorQueryPrecisionTest extends TestCase
{
    public function test_exactly_query_filter_uses_cent_rounding(): void
    {
        $included = $this->createLineItem(['t_amt' => '100.004']);
        $this->createLineItem(['t_amt' => '100.005']);

        $matchingIds = $this->matchingIds([
            'operator' => 'EXACTLY',
            'value' => '100',
        ]);

        $this->assertSame([$included->t_id], $matchingIds);
    }

    public function test_between_query_filter_uses_cent_rounding_for_boundaries(): void
    {
        $included = $this->createLineItem(['t_amt' => '100.004']);
        $this->createLineItem(['t_amt' => '100.005']);

        $matchingIds = $this->matchingIds([
            'operator' => 'BETWEEN',
            'value' => '50',
            'value_extra' => '100',
        ]);

        $this->assertSame([$included->t_id], $matchingIds);
    }

    /**
     * @param  array<string, mixed>  $attrs
     */
    private function createLineItem(array $attrs): FinAccountLineItems
    {
        return FinAccountLineItems::create(array_merge([
            't_account' => 1,
            't_date' => '2025-01-01',
            't_amt' => '0',
        ], $attrs));
    }

    /**
     * @param  array<string, mixed>  $attrs
     * @return array<int, int>
     */
    private function matchingIds(array $attrs): array
    {
        $condition = new FinRuleCondition;
        $condition->forceFill(array_merge(['type' => 'amount'], $attrs));

        $query = FinAccountLineItems::query();
        (new AmountConditionEvaluator)->applyToQuery($query, $condition);

        return $query->orderBy('t_id')->pluck('t_id')->all();
    }
}
