<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;

class DescriptionContainsConditionEvaluator implements RuleConditionEvaluatorInterface
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
}
