<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;

class StockSymbolConditionEvaluator implements RuleConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        $hasSymbol = $tx->t_symbol !== null && trim($tx->t_symbol) !== '';

        return match (strtoupper($condition->operator)) {
            'HAVE' => $hasSymbol,
            'DO_NOT_HAVE' => ! $hasSymbol,
            default => false,
        };
    }
}
