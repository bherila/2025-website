<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

class OptionTypeConditionEvaluator implements QueryConditionEvaluatorInterface
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

    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $operator = strtoupper($condition->operator);

        match ($operator) {
            'ANY' => $query->whereNotNull('opt_type')->where('opt_type', '!=', ''),
            'CALL' => $query->whereNotNull('opt_type')
                ->whereIn('opt_type', ['c', 'C', 'call', 'Call', 'CALL']),
            'PUT' => $query->whereNotNull('opt_type')
                ->whereIn('opt_type', ['p', 'P', 'put', 'Put', 'PUT']),
            default => null,
        };
    }
}
