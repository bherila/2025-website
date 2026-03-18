<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;

class AccountConditionEvaluator implements RuleConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        return match (strtoupper($condition->operator)) {
            'EQUALS' => (string) $tx->t_account === (string) $condition->value,
            default => false,
        };
    }
}
