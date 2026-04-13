<?php

namespace App\Finance\RulesEngine\Conditions;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Illuminate\Database\Eloquent\Builder;

/**
 * Interface for condition evaluators that support query-level optimization.
 *
 * Evaluators implementing this interface can apply their logic directly to
 * the Eloquent query builder, enabling database-level filtering instead of
 * fetching all records and evaluating in PHP.
 *
 * All current condition evaluators support query-level optimization.
 * If query application fails (e.g., invalid data), an exception should be thrown
 * and the processor will fall back to PHP evaluation.
 */
interface QueryConditionEvaluatorInterface extends RuleConditionEvaluatorInterface
{
    /**
     * Apply this condition to the query builder as a WHERE clause.
     *
     * This method should modify the query in-place using standard Eloquent
     * query builder methods or whereRaw() with parameter bindings.
     *
     * All SQL queries must be compatible with both MySQL and SQLite.
     *
     * @param  Builder<FinAccountLineItems>  $query  The Eloquent query builder to modify
     * @param  FinRuleCondition  $condition  The condition to apply
     *
     * @throws \Exception If the condition cannot be applied
     */
    public function applyToQuery(Builder $query, FinRuleCondition $condition): void;
}
