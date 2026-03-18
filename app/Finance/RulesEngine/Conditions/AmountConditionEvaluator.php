<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;

class AmountConditionEvaluator implements RuleConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        $absAmount = (string) abs((float) $tx->t_amt);
        $value = (string) $condition->value;

        return match (strtoupper($condition->operator)) {
            'ABOVE' => (float) $absAmount > (float) $value,
            'BELOW' => (float) $absAmount < (float) $value,
            'EXACTLY' => bccomp($absAmount, $value, 2) === 0,
            'BETWEEN' => (float) $absAmount >= (float) $value
                && (float) $absAmount <= (float) $condition->value_extra,
            default => false,
        };
    }
}
