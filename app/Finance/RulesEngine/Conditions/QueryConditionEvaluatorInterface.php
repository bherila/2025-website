<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

/**
 * Interface for condition evaluators that can be applied at the database query level.
 * This enables more efficient rule matching by filtering transactions in the database
 * rather than loading all transactions into memory.
 */
interface QueryConditionEvaluatorInterface extends RuleConditionEvaluatorInterface
{
    /**
     * Apply this condition as a WHERE constraint to the query builder.
     *
     * @param Builder $query The Eloquent query builder for FinAccountLineItems
     * @param FinRuleCondition $condition The condition configuration
     * @return void
     */
    public function applyToQuery(Builder $query, FinRuleCondition $condition): void;

    /**
     * Check if this condition can be applied at the query level.
     * Return false if the condition requires in-memory evaluation.
     *
     * @param FinRuleCondition $condition
     * @return bool
     */
    public function canApplyToQuery(FinRuleCondition $condition): bool;
}
