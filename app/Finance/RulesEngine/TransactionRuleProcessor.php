<?php

namespace App\Finance\RulesEngine;

use App\Finance\RulesEngine\Actions\ActionHandlerRegistry;
use App\Finance\RulesEngine\Conditions\ConditionEvaluatorRegistry;
use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Finance\RulesEngine\DTOs\RuleRunSummary;
use App\Finance\RulesEngine\DTOs\TransactionProcessingResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\FinRuleLog;
use App\Models\User;
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
     */
    public function processTransactions(array $transactions, User $user): RuleRunSummary
    {
        $rules = $this->loader->loadActiveRules($user);
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
     */
    public function runRuleNow(FinRule $rule, User $user): RuleRunSummary
    {
        $accountIds = FinAccounts::where('acct_owner', $user->id)
            ->pluck('acct_id');

        $transactions = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->orderByDesc('t_id')
            ->limit(1000)
            ->get();

        $rules = collect([$rule->load(['conditions', 'actions'])]);
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

                $processingTime = microtime(true) - $startTime;

                FinRuleLog::create([
                    'user_id' => $user->id,
                    'rule_id' => $rule->id,
                    'transaction_id' => $tx->t_id,
                    'is_manual_run' => $isManualRun,
                    'action_summary' => implode('; ', $actionSummaries),
                    'processing_time_mtime' => $processingTime,
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
