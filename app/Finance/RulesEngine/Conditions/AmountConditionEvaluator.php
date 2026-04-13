<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

class AmountConditionEvaluator implements QueryConditionEvaluatorInterface
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

    /**
     * @param  Builder<FinAccountLineItems>  $query
     */
    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $value = (float) $condition->value;

        $query->where(function ($q) use ($condition, $value) {
            $operator = strtoupper($condition->operator);

            switch ($operator) {
                case 'ABOVE':
                    // ABS(t_amt) > value
                    $q->whereRaw('ABS(t_amt) > ?', [$value]);
                    break;
                case 'BELOW':
                    // ABS(t_amt) < value
                    $q->whereRaw('ABS(t_amt) < ?', [$value]);
                    break;
                case 'EXACTLY':
                    // ABS(t_amt) = value (with tolerance for floating point)
                    $q->whereRaw('ABS(ABS(t_amt) - ?) < 0.01', [$value]);
                    break;
                case 'BETWEEN':
                    $valueExtra = (float) $condition->value_extra;
                    // value <= ABS(t_amt) <= value_extra
                    $q->whereRaw('ABS(t_amt) >= ? AND ABS(t_amt) <= ?', [$value, $valueExtra]);
                    break;
            }
        });
    }
}
