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
use App\Models\FinanceTool\FinRuleLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
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
     *
     * @param array<FinAccountLineItems>|array<int>|null $transactionsOrIds Optional array of transaction models or IDs.
     *                                                                       If null, processes against all user transactions (future: with query optimization).
     * @param User $user The user whose rules to apply
     * @return RuleRunSummary Summary of the rule processing
     */
    public function processTransactions($transactionsOrIds, User $user): RuleRunSummary
    {
        $rules = $this->loader->loadActiveRules($user);

        // Handle different input types
        if ($transactionsOrIds === null || (is_array($transactionsOrIds) && count($transactionsOrIds) === 0)) {
            // No specific transactions - fetch all user transactions
            $accountIds = FinAccounts::where('acct_owner', $user->id)->pluck('acct_id');
            $transactions = FinAccountLineItems::whereIn('t_account', $accountIds)->get();
        } elseif (is_array($transactionsOrIds) && count($transactionsOrIds) > 0 && is_int($transactionsOrIds[0])) {
            // Array of IDs - fetch by IDs
            $accountIds = FinAccounts::where('acct_owner', $user->id)->pluck('acct_id');
            $transactions = FinAccountLineItems::whereIn('t_account', $accountIds)
                ->whereIn('t_id', $transactionsOrIds)
                ->get();
        } else {
            // Array of transaction models
            $transactions = $transactionsOrIds;
        }

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
        $accountIds = FinAccounts::where('acct_owner', $user->id)
            ->pluck('acct_id');

        // Start with base query
        $query = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->orderByDesc('t_id')
            ->limit(1000);

        // Attempt to apply rule conditions at query level for optimization
        $canUseQueryOptimization = $this->tryApplyRuleConditionsToQuery($query, $rule);

        // Fetch transactions (filtered if optimization succeeded)
        $transactions = $query->get();

        $rules = collect([$rule->load(['conditions', 'actions'])]);
        $results = [];
        $totalMatched = 0;
        $totalApplied = 0;
        $totalErrors = 0;

        foreach ($transactions as $tx) {
            // Still apply in-memory check if query optimization wasn't possible
            if (! $canUseQueryOptimization) {
                if (! $this->allConditionsMatch($tx, $rule)) {
                    continue;
                }
            }

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
     * Try to apply rule conditions to query builder for database-level filtering.
     * Returns true if all conditions were successfully applied, false otherwise.
     *
     * @param Builder $query The query builder to modify
     * @param FinRule $rule The rule whose conditions to apply
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
                Log::warning('Failed to apply condition to query, falling back to PHP evaluation', [
                    'rule_id' => $rule->id,
                    'condition_type' => $condition->type,
                    'error' => $e->getMessage(),
                ]);

                return false;
            }
        }

        return true; // All conditions applied successfully
    }

    /**
     * Get transactions that match a rule's conditions without applying actions.
     * Returns up to 1000 matching transactions for preview purposes.
     *
     * @param FinRule $rule The rule whose conditions to match against
     * @param User $user The user whose transactions to search
     * @return \Illuminate\Support\Collection<FinAccountLineItems> Matching transactions
     */
    public function getMatchingTransactions(FinRule $rule, User $user): \Illuminate\Support\Collection
    {
        $accountIds = FinAccounts::where('acct_owner', $user->id)
            ->pluck('acct_id');

        // Start with base query
        $query = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->orderByDesc('t_id')
            ->limit(1000);

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
     * Apply a set of rules to a single transaction.
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
        \App\Models\FinanceTool\FinRuleAction $action,
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
