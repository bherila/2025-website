<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;

class DirectionConditionEvaluator implements RuleConditionEvaluatorInterface
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
}
