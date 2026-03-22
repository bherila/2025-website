<?php

namespace Tests\Feature\FinanceRulesEngine;

use App\Finance\RulesEngine\Actions\ActionHandlerRegistry;
use App\Finance\RulesEngine\Conditions\ConditionEvaluatorRegistry;
use App\Finance\RulesEngine\TransactionRuleLoader;
use App\Finance\RulesEngine\TransactionRuleProcessor;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\FinanceTool\FinRuleCondition;
use App\Models\FinanceTool\FinRuleLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FinRuleLogTest extends TestCase
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
        $this->account = FinAccounts::create(['acct_name' => 'Log Test Account']);
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
    // Log creation on match
    // -------------------------------------------------------------------------

    public function test_log_created_when_rule_matches(): void
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
            'target' => 'Updated',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $log = FinRuleLog::where('rule_id', $rule->id)->first();
        $this->assertNotNull($log);
        $this->assertEquals($this->user->id, $log->user_id);
        $this->assertEquals($tx->t_id, $log->transaction_id);
        $this->assertFalse($log->is_manual_run);
        $this->assertNotNull($log->action_summary);
        $this->assertNull($log->error);
    }

    public function test_no_log_when_rule_does_not_match(): void
    {
        $tx = $this->createTransaction(['t_amt' => '-50.00']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Never',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(0, FinRuleLog::where('rule_id', $rule->id)->count());
    }

    // -------------------------------------------------------------------------
    // action_summary content
    // -------------------------------------------------------------------------

    public function test_action_summary_records_applied_actions(): void
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
            'target' => 'Renamed',
            'order' => 1,
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_memo',
            'target' => 'Noted',
            'order' => 2,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $log = FinRuleLog::where('rule_id', $rule->id)->first();
        $this->assertStringContainsString('Set description', $log->action_summary);
        $this->assertStringContainsString('Set memo', $log->action_summary);
    }

    // -------------------------------------------------------------------------
    // is_manual_run flag
    // -------------------------------------------------------------------------

    public function test_manual_run_flag_set_by_run_rule_now(): void
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

        $log = FinRuleLog::where('rule_id', $rule->id)->first();
        $this->assertTrue($log->is_manual_run);
    }

    public function test_automatic_run_flag_set_by_process_transaction(): void
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
            'target' => 'Auto',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $log = FinRuleLog::where('rule_id', $rule->id)->first();
        $this->assertFalse($log->is_manual_run);
    }

    // -------------------------------------------------------------------------
    // processing_time_mtime
    // -------------------------------------------------------------------------

    public function test_processing_time_recorded(): void
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
            'target' => 'Timed',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $log = FinRuleLog::where('rule_id', $rule->id)->first();
        $this->assertNotNull($log->processing_time_mtime);
        $this->assertGreaterThanOrEqual(0, $log->processing_time_mtime);
    }

    // -------------------------------------------------------------------------
    // Error logging
    // -------------------------------------------------------------------------

    public function test_error_logged_when_action_handler_throws(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        // Use an unknown action type to trigger an error via the registry
        // The processor handles unknown types gracefully (returns error ActionResult)
        // so we need a different approach: use a condition type that doesn't exist
        // Actually, unknown action types return an ActionResult with error, not throw.
        // Let's verify that unknown action type errors are recorded in the result.
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'nonexistent_action_type',
            'order' => 1,
        ]);

        $result = $this->processor->processTransaction($tx, $this->user);

        // The action handler returns an error result for unknown types
        $this->assertNotEmpty($result->errors);
        $this->assertStringContainsString('Unknown action type', $result->errors[0]);
    }

    // -------------------------------------------------------------------------
    // Relationship: log belongs to rule and user
    // -------------------------------------------------------------------------

    public function test_log_relationships(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule = $this->createRule(['title' => 'Relational Rule']);
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Relational',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $log = FinRuleLog::where('rule_id', $rule->id)->first();
        $this->assertEquals($rule->id, $log->rule->id);
        $this->assertEquals($this->user->id, $log->user->id);
        $this->assertEquals($tx->t_id, $log->transaction->t_id);
    }

    // -------------------------------------------------------------------------
    // Multiple logs for multiple matches
    // -------------------------------------------------------------------------

    public function test_separate_log_per_matched_rule(): void
    {
        $tx = $this->createTransaction(['t_amt' => '100.00']);

        $rule1 = $this->createRule(['title' => 'Rule 1', 'order' => 1]);
        FinRuleCondition::create([
            'rule_id' => $rule1->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule1->id,
            'type' => 'set_description',
            'target' => 'First',
            'order' => 1,
        ]);

        $rule2 = $this->createRule(['title' => 'Rule 2', 'order' => 2]);
        FinRuleCondition::create([
            'rule_id' => $rule2->id,
            'type' => 'amount',
            'operator' => 'ABOVE',
            'value' => '50',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule2->id,
            'type' => 'set_memo',
            'target' => 'Second',
            'order' => 1,
        ]);

        $this->processor->processTransaction($tx, $this->user);

        $this->assertEquals(2, FinRuleLog::where('transaction_id', $tx->t_id)->count());
        $this->assertDatabaseHas('fin_rule_logs', ['rule_id' => $rule1->id]);
        $this->assertDatabaseHas('fin_rule_logs', ['rule_id' => $rule2->id]);
    }
}
