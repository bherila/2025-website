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
            'IS_SYMBOL' => $this->matchesSymbolList($tx->t_symbol, $condition->value),
            default => false,
        };
    }

    private function matchesSymbolList(?string $symbol, ?string $value): bool
    {
        if ($symbol === null || trim($symbol) === '') {
            return false;
        }

        $symbols = array_filter(
            array_map('trim', explode(',', $value ?? '')),
            fn ($s) => $s !== ''
        );

        return in_array(strtoupper(trim($symbol)), array_map('strtoupper', $symbols));
    }

    /**
     * @param  Builder<FinAccountLineItems>  $query
     */
    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $operator = strtoupper($condition->operator);

        match ($operator) {
            'HAVE' => $query->whereNotNull('t_symbol')->where('t_symbol', '!=', ''),
            'DO_NOT_HAVE' => $query->where(function ($q) {
                $q->whereNull('t_symbol')->orWhere('t_symbol', '=', '');
            }),
            'IS_SYMBOL' => $this->applyIsSymbolToQuery($query, $condition->value),
            default => null,
        };
    }

    /**
     * @param  Builder<FinAccountLineItems>  $query
     */
    private function applyIsSymbolToQuery(Builder $query, ?string $value): void
    {
        $symbols = array_filter(
            array_map('strtoupper', array_map('trim', explode(',', $value ?? ''))),
            fn ($s) => $s !== ''
        );

        if (empty($symbols)) {
            $query->whereRaw('0 = 1');

            return;
        }

        $query->whereRaw('UPPER(t_symbol) IN ('.implode(',', array_fill(0, count($symbols), '?')).')', array_values($symbols));
    }
}
