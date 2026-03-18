<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;

class OptionTypeConditionEvaluator implements RuleConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        $optType = $tx->opt_type;
        $hasOption = $optType !== null && trim($optType) !== '';

        return match (strtoupper($condition->operator)) {
            'ANY' => $hasOption,
            'CALL' => $hasOption && in_array(strtolower(trim($optType)), ['c', 'call'], true),
            'PUT' => $hasOption && in_array(strtolower(trim($optType)), ['p', 'put'], true),
            default => false,
        };
    }
}
