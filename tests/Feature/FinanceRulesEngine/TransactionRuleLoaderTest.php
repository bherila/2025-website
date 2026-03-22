<?php

namespace Tests\Feature\FinanceRulesEngine;

use App\Finance\RulesEngine\TransactionRuleLoader;
use App\Models\FinanceTool\FinRule;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\FinanceTool\FinRuleCondition;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TransactionRuleLoaderTest extends TestCase
{
    use RefreshDatabase;

    private TransactionRuleLoader $loader;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->loader = new TransactionRuleLoader;
        $this->user = $this->createUser();
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
    // loadActiveRules
    // -------------------------------------------------------------------------

    public function test_loads_active_rules_ordered(): void
    {
        $rule2 = $this->createRule(['title' => 'Rule B', 'order' => 2]);
        $rule1 = $this->createRule(['title' => 'Rule A', 'order' => 1]);
        $rule3 = $this->createRule(['title' => 'Rule C', 'order' => 3]);

        $rules = $this->loader->loadActiveRules($this->user);

        $this->assertCount(3, $rules);
        $this->assertEquals('Rule A', $rules[0]->title);
        $this->assertEquals('Rule B', $rules[1]->title);
        $this->assertEquals('Rule C', $rules[2]->title);
    }

    public function test_excludes_disabled_rules(): void
    {
        $this->createRule(['title' => 'Active', 'order' => 1, 'is_disabled' => false]);
        $this->createRule(['title' => 'Disabled', 'order' => 2, 'is_disabled' => true]);

        $rules = $this->loader->loadActiveRules($this->user);

        $this->assertCount(1, $rules);
        $this->assertEquals('Active', $rules[0]->title);
    }

    public function test_eager_loads_conditions_and_actions(): void
    {
        $rule = $this->createRule();
        FinRuleCondition::create([
            'rule_id' => $rule->id,
            'type' => 'direction',
            'operator' => 'INCOME',
        ]);
        FinRuleAction::create([
            'rule_id' => $rule->id,
            'type' => 'set_description',
            'target' => 'Test',
            'order' => 1,
        ]);

        $rules = $this->loader->loadActiveRules($this->user);

        $this->assertTrue($rules[0]->relationLoaded('conditions'));
        $this->assertTrue($rules[0]->relationLoaded('actions'));
        $this->assertCount(1, $rules[0]->conditions);
        $this->assertCount(1, $rules[0]->actions);
    }

    // -------------------------------------------------------------------------
    // loadAllRules
    // -------------------------------------------------------------------------

    public function test_load_all_rules_includes_disabled(): void
    {
        $this->createRule(['title' => 'Active', 'is_disabled' => false]);
        $this->createRule(['title' => 'Disabled', 'is_disabled' => true, 'order' => 2]);

        $rules = $this->loader->loadAllRules($this->user);

        $this->assertCount(2, $rules);
    }

    public function test_load_all_rules_ordered(): void
    {
        $this->createRule(['title' => 'Third', 'order' => 3]);
        $this->createRule(['title' => 'First', 'order' => 1]);
        $this->createRule(['title' => 'Second', 'order' => 2]);

        $rules = $this->loader->loadAllRules($this->user);

        $this->assertEquals('First', $rules[0]->title);
        $this->assertEquals('Second', $rules[1]->title);
        $this->assertEquals('Third', $rules[2]->title);
    }

    // -------------------------------------------------------------------------
    // User isolation
    // -------------------------------------------------------------------------

    public function test_does_not_load_other_users_rules(): void
    {
        $otherUser = $this->createUser();

        $this->createRule(['title' => 'My Rule']);
        FinRule::create([
            'user_id' => $otherUser->id,
            'order' => 1,
            'title' => 'Other User Rule',
            'is_disabled' => false,
            'stop_processing_if_match' => false,
        ]);

        $myRules = $this->loader->loadActiveRules($this->user);
        $otherRules = $this->loader->loadActiveRules($otherUser);

        $this->assertCount(1, $myRules);
        $this->assertEquals('My Rule', $myRules[0]->title);
        $this->assertCount(1, $otherRules);
        $this->assertEquals('Other User Rule', $otherRules[0]->title);
    }

    public function test_returns_empty_for_user_with_no_rules(): void
    {
        $rules = $this->loader->loadActiveRules($this->user);

        $this->assertCount(0, $rules);
    }

    // -------------------------------------------------------------------------
    // Soft-deleted rules excluded
    // -------------------------------------------------------------------------

    public function test_soft_deleted_rules_excluded(): void
    {
        $rule = $this->createRule(['title' => 'Will be deleted']);
        $rule->delete(); // soft delete

        $this->createRule(['title' => 'Still active', 'order' => 2]);

        $activeRules = $this->loader->loadActiveRules($this->user);
        $allRules = $this->loader->loadAllRules($this->user);

        $this->assertCount(1, $activeRules);
        $this->assertCount(1, $allRules);
        $this->assertEquals('Still active', $activeRules[0]->title);
    }
}
