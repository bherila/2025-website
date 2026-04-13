<?php

namespace App\Finance\RulesEngine;

use App\Finance\RulesEngine\Actions\ActionHandlerRegistry;
use App\Finance\RulesEngine\Conditions\ConditionEvaluatorRegistry;
use App\Finance\RulesEngine\Conditions\QueryConditionEvaluatorInterface;
use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Finance\RulesEngine\DTOs\RuleRunSummary;
use App\Finance\RulesEngine\DTOs\TransactionProcessingResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\FinanceTool\FinRuleLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;

class TransactionRuleProcessor
{
    public function __construct(
        private readonly TransactionRuleLoader $loader,
        private readonly ConditionEvaluatorRegistry $conditionRegistry,
        private readonly ActionHandlerRegistry $actionRegistry,
    ) {}

    /**
     * Run all active rules against a single transaction.
     */
    public function processTransaction(FinAccountLineItems $tx, User $user): TransactionProcessingResult
    {
        $rules = $this->loader->loadActiveRules($user);

        return $this->applyRulesToTransaction($tx, $rules, $user, isManualRun: false);
    }

    /**
     * Run all active rules against multiple transactions.
     * All rule matching is performed at the database level for optimal performance.
     *
     * @param  array<int>|null  $transactionIds  Optional array of transaction IDs to process, or null for all user transactions.
     * @param  User  $user  The user whose rules to apply
     * @return RuleRunSummary Summary of the rule processing
     */
    public function processTransactions(?array $transactionIds, User $user): RuleRunSummary
    {
        $rules = $this->loader->loadActiveRules($user);

        // Build query for user's transactions
        $accountIds = FinAccounts::where('acct_owner', $user->id)->pluck('acct_id');
        $query = FinAccountLineItems::whereIn('t_account', $accountIds);

        // Add transaction ID filter if provided
        if ($transactionIds !== null && count($transactionIds) > 0) {
            $query->whereIn('t_id', $transactionIds);
        }

        // Fetch transactions - note: we fetch all transactions first since we have
        // multiple rules. Future optimization: process rules one at a time with
        // query optimization per rule.
        $transactions = $query->get();

        // Process each transaction
        $results = [];
        $totalMatched = 0;
        $totalApplied = 0;
        $totalErrors = 0;

        foreach ($transactions as $tx) {
            $result = $this->applyRulesToTransaction($tx, $rules, $user, isManualRun: false);
            $results[] = $result;
            $totalMatched += $result->rulesMatched;
            $totalApplied += $result->actionsApplied;
            $totalErrors += count($result->errors);
        }

        return new RuleRunSummary(
            transactionsProcessed: count($transactions),
            rulesMatched: $totalMatched,
            actionsApplied: $totalApplied,
            errors: $totalErrors,
            transactionResults: $results,
        );
    }

    /**
     * Run a single rule against the latest 1000 transactions for the user.
     * Uses database-level filtering when all rule conditions support query optimization.
     */
    public function runRuleNow(FinRule $rule, User $user): RuleRunSummary
    {
        $rules = collect([$rule->load(['conditions', 'actions'])]);
        $transactions = $this->getTransactionsForRule($rule, $user, limit: 1000);

        $results = [];
        $totalMatched = 0;
        $totalApplied = 0;
        $totalErrors = 0;

        foreach ($transactions as $tx) {
            $result = $this->applyRulesToTransaction($tx, $rules, $user, isManualRun: true);
            $results[] = $result;
            $totalMatched += $result->rulesMatched;
            $totalApplied += $result->actionsApplied;
            $totalErrors += count($result->errors);
        }

        return new RuleRunSummary(
            transactionsProcessed: $transactions->count(),
            rulesMatched: $totalMatched,
            actionsApplied: $totalApplied,
            errors: $totalErrors,
            transactionResults: $results,
        );
    }

    /**
     * Get transactions that match a rule's conditions with query-level optimization.
     * This method is shared between runRuleNow() and getMatchingTransactions().
     *
     * @param  FinRule  $rule  The rule whose conditions to apply
     * @param  User  $user  The user whose transactions to search
     * @param  int|null  $limit  Maximum number of transactions to return
     * @return Collection<int, FinAccountLineItems> Matching transactions
     */
    private function getTransactionsForRule(FinRule $rule, User $user, ?int $limit = null): Collection
    {
        $accountIds = FinAccounts::where('acct_owner', $user->id)
            ->pluck('acct_id');

        // Start with base query
        $query = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->orderByDesc('t_id');

        if ($limit !== null) {
            $query->limit($limit);
        }

        // Attempt to apply rule conditions at query level for optimization
        $canUseQueryOptimization = $this->tryApplyRuleConditionsToQuery($query, $rule);

        // Fetch transactions (filtered if optimization succeeded)
        $transactions = $query->get();

        // If query optimization wasn't possible, filter in PHP
        if (! $canUseQueryOptimization) {
            return $transactions->filter(fn ($tx) => $this->allConditionsMatch($tx, $rule));
        }

        return $transactions;
    }

    /**
     * Try to apply rule conditions to query builder for database-level filtering.
     * Returns true if all conditions were successfully applied, false otherwise.
     *
     * @param  Builder<FinAccountLineItems>  $query  The query builder to modify
     * @param  FinRule  $rule  The rule whose conditions to apply
     * @return bool True if query optimization was successful
     */
    private function tryApplyRuleConditionsToQuery(Builder $query, FinRule $rule): bool
    {
        if ($rule->conditions->isEmpty()) {
            return true; // No conditions means match all
        }

        foreach ($rule->conditions as $condition) {
            if (! $this->conditionRegistry->has($condition->type)) {
                return false; // Unknown condition type
            }

            $evaluator = $this->conditionRegistry->get($condition->type);

            // Check if evaluator supports query-level filtering
            if (! ($evaluator instanceof QueryConditionEvaluatorInterface)) {
                return false;
            }

            try {
                $evaluator->applyToQuery($query, $condition);
            } catch (\Throwable $e) {
                // Report to Sentry - this indicates a bug in the condition evaluator
                report($e);

                Log::error('Failed to apply condition to query - this is a bug', [
                    'rule_id' => $rule->id,
                    'condition_type' => $condition->type,
                    'condition_id' => $condition->id,
                    'error' => $e->getMessage(),
                    'trace' => $e->getTraceAsString(),
                ]);

                // Don't fall back to PHP - let the rule fail to process
                // This ensures bugs are caught and fixed
                return false;
            }
        }

        return true; // All conditions applied successfully
    }

    /**
     * Get transactions that match a rule's conditions without applying actions.
     * Returns up to 1000 matching transactions for preview purposes.
     *
     * @param  FinRule  $rule  The rule whose conditions to match against
     * @param  User  $user  The user whose transactions to search
     * @return Collection<int, FinAccountLineItems> Matching transactions
     */
    public function getMatchingTransactions(FinRule $rule, User $user): Collection
    {
        return $this->getTransactionsForRule($rule, $user, limit: 1000);
    }

    /**
     * Apply a set of rules to a single transaction.
     *
     * @param  iterable<FinRule>  $rules
     */
    private function applyRulesToTransaction(
        FinAccountLineItems $tx,
        iterable $rules,
        User $user,
        bool $isManualRun,
    ): TransactionProcessingResult {
        $rulesMatched = 0;
        $actionsApplied = 0;
        $errors = [];

        foreach ($rules as $rule) {
            try {
                if (! $this->allConditionsMatch($tx, $rule)) {
                    continue;
                }

                $rulesMatched++;
                $startTime = microtime(true);
                $actionSummaries = [];
                $stopProcessing = false;

                foreach ($rule->actions->sortBy('order') as $action) {
                    $result = $this->executeAction($tx, $action, $user);

                    if ($result->applied) {
                        $actionsApplied++;
                        $actionSummaries[] = $result->summary;
                    }

                    if ($result->error) {
                        $errors[] = $result->error;
                        $actionSummaries[] = "ERROR: {$result->error}";
                    }

                    if ($result->stopProcessing) {
                        $stopProcessing = true;

                        break;
                    }
                }

                $processingTimeMicros = (int) ((microtime(true) - $startTime) * 1_000_000);

                FinRuleLog::create([
                    'user_id' => $user->id,
                    'rule_id' => $rule->id,
                    'transaction_id' => $tx->t_id,
                    'is_manual_run' => $isManualRun,
                    'action_summary' => implode('; ', $actionSummaries),
                    'processing_time_mtime' => $processingTimeMicros,
                ]);

                if ($stopProcessing || $rule->stop_processing_if_match) {
                    break;
                }
            } catch (\Throwable $e) {
                $errors[] = "Rule {$rule->id}: {$e->getMessage()}";

                FinRuleLog::create([
                    'user_id' => $user->id,
                    'rule_id' => $rule->id,
                    'transaction_id' => $tx->t_id,
                    'is_manual_run' => $isManualRun,
                    'error' => $e->getMessage(),
                    'error_details' => $e->getTraceAsString(),
                    'processing_time_mtime' => 0,
                ]);

                report($e);
            }
        }

        return new TransactionProcessingResult(
            transactionId: $tx->t_id,
            rulesMatched: $rulesMatched,
            actionsApplied: $actionsApplied,
            errors: $errors,
        );
    }

    /**
     * Check if all conditions on a rule match the transaction (AND logic).
     */
    private function allConditionsMatch(FinAccountLineItems $tx, FinRule $rule): bool
    {
        foreach ($rule->conditions as $condition) {
            if (! $this->conditionRegistry->has($condition->type)) {
                Log::warning("Unknown condition type: {$condition->type}", [
                    'rule_id' => $rule->id,
                    'condition_id' => $condition->id,
                ]);

                return false;
            }

            $evaluator = $this->conditionRegistry->get($condition->type);

            if (! $evaluator->matches($tx, $condition)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Execute a single action against a transaction.
     */
    private function executeAction(
        FinAccountLineItems $tx,
        FinRuleAction $action,
        User $user,
    ): ActionResult {
        if (! $this->actionRegistry->has($action->type)) {
            return new ActionResult(
                applied: false,
                summary: "Unknown action type: {$action->type}",
                error: "Unknown action type: {$action->type}",
            );
        }

        $handler = $this->actionRegistry->get($action->type);

        return $handler->apply($tx, $action, $user);
    }
}
