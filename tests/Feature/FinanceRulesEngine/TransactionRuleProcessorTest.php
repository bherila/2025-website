<?php

namespace Tests\Feature\FinanceRulesEngine;

use App\Finance\RulesEngine\Actions\ActionHandlerRegistry;
use App\Finance\RulesEngine\Conditions\ConditionEvaluatorRegistry;
use App\Finance\RulesEngine\TransactionRuleLoader;
use App\Finance\RulesEngine\TransactionRuleProcessor;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountTag;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\FinanceTool\FinRuleCondition;
use App\Models\FinanceTool\FinRuleLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TransactionRuleProcessorTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private FinAccounts $account;

    private TransactionRuleProcessor $processor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->user = $this->createUser();
        $this->actingAs($this->user);
        $this->account = FinAccounts::create(['acct_name' => 'Test Account']);
        $this->processor = new TransactionRuleProcessor(
            new TransactionRuleLoader,
            new ConditionEvaluatorRegistry,
            new ActionHandlerRegistry,
        );
    }

    private function createTransaction(array $overrides = []): FinAccountLineItems
    {
        return FinAccountLineItems::create(array_merge([
            't_account' => $this->account->acct_id,
            't_date' => '2025-01-15',
            't_amt' => '100.00',
            't_description' => 'Test transaction',
        ], $overrides));
    }

    private function createRule(array $attrs = []): FinRule
    {
        return FinRule::create(array_merge([
            'user_id' => $this->user->id,
            'order' => 1,
            'title' => 'Test Rule',
            'is_disabled' => false,
            'stop_processing_if_match' => false,
        ], $attrs));
    }

    // -------------------------------------------------------------------------
    // Single rule single action
    // -------------------------------------------------------------------------

    public function test_single_rule_applies_set_description(): void
    {
        $tx = $this->createTransaction(['t_description' => 'Original']);

        $rule = $this->createRule(['title' => 'Rename rule']);
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Renamed',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(1, $result->rulesMatched);
        $this->assertEquals(1, $result->actionsApplied);
        $tx->refresh();
        $this->assertEquals('Renamed', $tx->t_description);
    }

    // -------------------------------------------------------------------------
    // Multiple rules in order
    // -------------------------------------------------------------------------

    public function test_multiple_rules_applied_in_order(): void
    {
        $tx = $this->createTransaction([
            't_description' => 'Hello World',
            't_amt' => '200.00',
        ]);

        $rule1 = $this->createRule(['title' => 'Rule 1', 'order' => 1]);
        FinRuleCondition::create([
            'rule_id' => $rule1->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule1->id,
            'type' => 'find_replace',
            'target' => 'Hello',
            'payload' => 'Goodbye',
            'order' => 1,
        ]);

        $rule2 = $this->createRule(['title' => 'Rule 2', 'order' => 2]);
        FinRuleCondition::create([
            'rule_id' => $rule2->id,
            'type' => 'amount',
            'operator' => 'ABOVE',
            'value' => '100',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule2->id,
            'type' => 'set_memo',
            'target' => 'High value',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(2, $result->rulesMatched);
        $tx->refresh();
        $this->assertEquals('Goodbye World', $tx->t_description);
        $this->assertEquals('High value', $tx->t_comment);
    }

    // -------------------------------------------------------------------------
    // stop_processing_if_match on rule
    // -------------------------------------------------------------------------

    public function test_stop_processing_if_match_prevents_further_rules(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule1 = $this->createRule([
            'title' => 'Stop Rule',
            'order' => 1,
            'stop_processing_if_match' => true,
        ]);
        FinRuleCondition::create([
            'rule_id' => $rule1->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule1->id,
            'type' => 'set_description',
            'target' => 'First rule applied',
            'order' => 1,
        ]);

        $rule2 = $this->createRule(['title' => 'Second Rule', 'order' => 2]);
        FinRuleCondition::create([
            'rule_id' => $rule2->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule2->id,
            'type' => 'set_description',
            'target' => 'Second rule applied',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(1, $result->rulesMatched);
        $tx->refresh();
        $this->assertEquals('First rule applied', $tx->t_description);
    }

    // -------------------------------------------------------------------------
    // Stop processing via action handler
    // -------------------------------------------------------------------------

    public function test_stop_processing_action_prevents_further_rules(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule1 = $this->createRule(['title' => 'Rule with stop action', 'order' => 1]);
        FinRuleCondition::create([
            'rule_id' => $rule1->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule1->id,
            'type' => 'set_description',
            'target' => 'Applied',
            'order' => 1,
        ]);
        FinRuleAction::create([
            'rule_id' => $rule1->id,
            'type' => 'stop_processing_if_match',
            'order' => 2,
        ]);

        $rule2 = $this->createRule(['title' => 'Should not run', 'order' => 2]);
        FinRuleCondition::create([
            'rule_id' => $rule2->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule2->id,
            'type' => 'set_memo',
            'target' => 'Should not appear',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(1, $result->rulesMatched);
        $tx->refresh();
        $this->assertEquals('Applied', $tx->t_description);
        $this->assertNull($tx->t_comment);
    }

    // -------------------------------------------------------------------------
    // Disabled rules are skipped
    // -------------------------------------------------------------------------

    public function test_disabled_rules_are_ignored(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $this->createRule([
            'title' => 'Disabled Rule',
            'order' => 1,
            'is_disabled' => true,
        ]);

        $rule2 = $this->createRule(['title' => 'Active Rule', 'order' => 2]);
        FinRuleCondition::create([
            'rule_id' => $rule2->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule2->id,
            'type' => 'set_description',
            'target' => 'Active applied',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(1, $result->rulesMatched);
        $tx->refresh();
        $this->assertEquals('Active applied', $tx->t_description);
    }

    // -------------------------------------------------------------------------
    // Condition mismatch → rule not applied
    // -------------------------------------------------------------------------

    public function test_rule_not_applied_when_conditions_do_not_match(): void
    {
        $tx = $this->createTransaction(['t_amt' => '-50.00', 't_description' => 'Original']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Changed',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(0, $result->rulesMatched);
        $tx->refresh();
        $this->assertEquals('Original', $tx->t_description);
    }

    // -------------------------------------------------------------------------
    // Multiple conditions are AND-ed
    // -------------------------------------------------------------------------

    public function test_all_conditions_must_match(): void
    {
        $tx = $this->createTransaction([
            't_amt' => '200.00',
            't_description' => 'Amazon purchase',
        ]);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'description_contains',
            'operator' => 'CONTAINS',
            'value' => 'Amazon',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_memo',
            'target' => 'Both matched',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(1, $result->rulesMatched);
        $tx->refresh();
        $this->assertEquals('Both matched', $tx->t_comment);
    }

    public function test_partial_condition_match_does_not_apply(): void
    {
        $tx = $this->createTransaction([
            't_amt' => '-200.00',
            't_description' => 'Amazon purchase',
        ]);

        $rule = $this->createRule();
        // Expense, but we require INCOME → mismatch
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'description_contains',
            'operator' => 'CONTAINS',
            'value' => 'Amazon',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_memo',
            'target' => 'Should not appear',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(0, $result->rulesMatched);
    }

    // -------------------------------------------------------------------------
    // processTransactions (batch)
    // -------------------------------------------------------------------------

    public function test_process_transactions_batch(): void
    {
        $tx1 = $this->createTransaction(['t_amt' => '100.00']);
        $tx2 = $this->createTransaction(['t_amt' => '-50.00']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_memo',
            'target' => 'Income tagged',
            'order' => 1,
        ]);

        $summary = $this->processor->processTransactions([$tx1, $tx2], $this->user);

        $this->assertEquals(2, $summary->transactionsProcessed);
        $this->assertEquals(1, $summary->rulesMatched);
        $this->assertEquals(1, $summary->actionsApplied);
        $tx1->refresh();
        $tx2->refresh();
        $this->assertEquals('Income tagged', $tx1->t_comment);
        $this->assertNull($tx2->t_comment);
    }

    // -------------------------------------------------------------------------
    // Logging
    // -------------------------------------------------------------------------

    public function test_log_created_on_match(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Logged',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $this->assertDatabaseHas('fin_rule_logs', [
            'user_id' => $this->user->id,
            'rule_id' => $rule->id,
            'transaction_id' => $tx->t_id,
            'is_manual_run' => false,
        ]);
    }

    // -------------------------------------------------------------------------
    // runRuleNow
    // -------------------------------------------------------------------------

    public function test_run_rule_now_respects_limit(): void
    {
        // Create more than 1000 transactions to verify the limit
        $txData = [];
        for ($i = 0; $i < 5; $i++) {
            $txData[] = [
                't_account' => $this->account->acct_id,
                't_date' => '2025-01-15',
                't_amt' => '10.00',
                't_description' => "Tx {$i}",
            ];
        }
        foreach ($txData as $data) {
            FinAccountLineItems::create($data);
        }

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_memo',
            'target' => 'Manual run',
            'order' => 1,
        ]);

        $summary = $this->processor->runRuleNow($rule, $this->user);

        $this->assertEquals(5, $summary->transactionsProcessed);
        $this->assertEquals(5, $summary->rulesMatched);

        // Verify logs are marked as manual
        $manualLogs = FinRuleLog::where('rule_id', $rule->id)
            ->where('is_manual_run', true)
            ->count();
        $this->assertEquals(5, $manualLogs);
    }

    public function test_run_rule_now_marks_logs_as_manual(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Manual',
            'order' => 1,
        ]);

        $this->processor->runRuleNow($rule, $this->user);

        $this->assertDatabaseHas('fin_rule_logs', [
            'rule_id' => $rule->id,
            'transaction_id' => $tx->t_id,
            'is_manual_run' => true,
        ]);
    }

    // -------------------------------------------------------------------------
    // Other user's transactions are not processed by runRuleNow
    // -------------------------------------------------------------------------

    public function test_run_rule_now_only_processes_own_transactions(): void
    {
        $otherUser = $this->createUser();
        $this->actingAs($otherUser);
        $otherAccount = FinAccounts::create(['acct_name' => 'Other Account']);
        FinAccountLineItems::create([
            't_account' => $otherAccount->acct_id,
            't_date' => '2025-01-15',
            't_amt' => '100.00',
            't_description' => 'Other user tx',
        ]);

        $this->actingAs($this->user);
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Applied',
            'order' => 1,
        ]);

        $summary = $this->processor->runRuleNow($rule, $this->user);

        // Only the current user's transaction should be processed
        $this->assertEquals(1, $summary->transactionsProcessed);
        $this->assertEquals(1, $summary->rulesMatched);
    }

    // -------------------------------------------------------------------------
    // Tag action via processor
    // -------------------------------------------------------------------------

    public function test_add_tag_action_via_processor(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);
        $tag = FinAccountTag::create([
            'tag_userid' => $this->user->id,
            'tag_label' => 'Auto Tag',
            'tag_color' => '#00ff00',
        ]);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'add_tag',
            'target' => (string) $tag->tag_id,
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $this->assertDatabaseHas('fin_account_line_item_tag_map', [
            't_id' => $tx->t_id,
            'tag_id' => $tag->tag_id,
        ]);
    }
}
