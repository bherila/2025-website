<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

class AccountConditionEvaluator implements QueryConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        return match (strtoupper($condition->operator)) {
            'EQUALS' => (string) $tx->t_account === (string) $condition->value,
            default => false,
        };
    }

    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $accountId = (int) $condition->value;
        $query->where('t_account', $accountId);
    }

    public function canApplyToQuery(FinRuleCondition $condition): bool
    {
        return true; // All account conditions can be applied at query level
    }
}
