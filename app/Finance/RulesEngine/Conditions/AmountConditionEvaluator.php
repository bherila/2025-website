<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use App\Services\Finance\MoneyMath;
use Illuminate\Database\Eloquent\Builder;

class AmountConditionEvaluator implements QueryConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        $amountCents = abs(MoneyMath::toCents((string) $tx->t_amt));
        $valueCents = abs(MoneyMath::toCents((string) $condition->value));
        $valueExtraCents = abs(MoneyMath::toCents((string) $condition->value_extra));

        return match (strtoupper($condition->operator)) {
            'ABOVE' => $amountCents > $valueCents,
            'BELOW' => $amountCents < $valueCents,
            'EXACTLY' => $amountCents === $valueCents,
            'BETWEEN' => $amountCents >= $valueCents && $amountCents <= $valueExtraCents,
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
