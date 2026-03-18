<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

class DescriptionContainsConditionEvaluator implements QueryConditionEvaluatorInterface
{
    public function matches(FinAccountLineItems $tx, FinRuleCondition $condition): bool
    {
        $needle = strtolower($condition->value ?? '');
        $description = strtolower($tx->t_description ?? '');
        $comment = strtolower($tx->t_comment ?? '');

        $found = str_contains($description, $needle) || str_contains($comment, $needle);

        return match (strtoupper($condition->operator)) {
            'CONTAINS' => $found,
            'NOT_CONTAINS' => ! $found,
            default => false,
        };
    }

    public function applyToQuery(Builder $query, FinRuleCondition $condition): void
    {
        $needle = $condition->value ?? '';
        $operator = strtoupper($condition->operator);

        $query->where(function ($q) use ($needle, $operator) {
            if ($operator === 'CONTAINS') {
                $q->where('t_description', 'LIKE', "%{$needle}%")
                    ->orWhere('t_comment', 'LIKE', "%{$needle}%");
            } elseif ($operator === 'NOT_CONTAINS') {
                $q->where(function ($subQ) use ($needle) {
                    $subQ->where('t_description', 'NOT LIKE', "%{$needle}%")
                        ->orWhereNull('t_description');
                })->where(function ($subQ) use ($needle) {
                    $subQ->where('t_comment', 'NOT LIKE', "%{$needle}%")
                        ->orWhereNull('t_comment');
                });
            }
        });
    }

    public function canApplyToQuery(FinRuleCondition $condition): bool
    {
        return true; // All description contains conditions can be applied at query level
    }
}
