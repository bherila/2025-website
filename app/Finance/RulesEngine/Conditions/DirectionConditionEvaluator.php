<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

class DirectionConditionEvaluator implements QueryConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        $amount = (float) $tx->t_amt;

        return match (strtoupper($condition->operator)) {
            'INCOME' => $amount > 0,
            'EXPENSE' => $amount < 0,
            default => false,
        };
    }

    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $operator = strtoupper($condition->operator);

        match ($operator) {
            'INCOME' => $query->where('t_amt', '>', 0),
            'EXPENSE' => $query->where('t_amt', '<', 0),
            default => null,
        };
    }

    public function canApplyToQuery(FinRuleCondition $condition): bool
    {
        return true; // All direction conditions can be applied at query level
    }
}
