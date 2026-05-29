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
        $valueCents = abs(MoneyMath::toCents((string) $condition->value));

        $query->where(function ($q) use ($condition, $valueCents) {
            $operator = strtoupper($condition->operator);
            $amountCentsSql = $this->amountCentsSql();

            switch ($operator) {
                case 'ABOVE':
                    $q->whereRaw("{$amountCentsSql} > ?", [$valueCents]);
                    break;
                case 'BELOW':
                    $q->whereRaw("{$amountCentsSql} < ?", [$valueCents]);
                    break;
                case 'EXACTLY':
                    $q->whereRaw("{$amountCentsSql} = ?", [$valueCents]);
                    break;
                case 'BETWEEN':
                    $valueExtraCents = abs(MoneyMath::toCents((string) $condition->value_extra));
                    $q->whereRaw("{$amountCentsSql} >= ? AND {$amountCentsSql} <= ?", [$valueCents, $valueExtraCents]);
                    break;
            }
        });
    }

    private function amountCentsSql(): string
    {
        return 'ROUND(ABS(t_amt) * 100, 0)';
    }
}
