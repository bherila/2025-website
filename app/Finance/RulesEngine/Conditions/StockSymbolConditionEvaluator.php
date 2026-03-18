<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

class StockSymbolConditionEvaluator implements QueryConditionEvaluatorInterface
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

    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $operator = strtoupper($condition->operator);

        match ($operator) {
            'HAVE' => $query->whereNotNull('t_symbol')->where('t_symbol', '!=', ''),
            'DO_NOT_HAVE' => $query->where(function ($q) {
                $q->whereNull('t_symbol')->orWhere('t_symbol', '=', '');
            }),
            default => null,
        };
    }
}
