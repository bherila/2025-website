<?php

namespace Tests\Feature\FinanceRulesEngine;

use App\Finance\RulesEngine\Conditions\AccountConditionEvaluator;
use App\Finance\RulesEngine\Conditions\AmountConditionEvaluator;
use App\Finance\RulesEngine\Conditions\DescriptionContainsConditionEvaluator;
use App\Finance\RulesEngine\Conditions\DirectionConditionEvaluator;
use App\Finance\RulesEngine\Conditions\OptionTypeConditionEvaluator;
use App\Finance\RulesEngine\Conditions\StockSymbolConditionEvaluator;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleCondition;
use Tests\TestCase;

class RuleConditionEvaluatorTest extends TestCase
{
    private function makeCondition(array $attrs): FinRuleCondition
    {
        $condition = new FinRuleCondition;
        $condition->forceFill($attrs);

        return $condition;
    }

    private function makeTransaction(array $attrs): FinAccountLineItems
    {
        $tx = new FinAccountLineItems;
        $tx->forceFill(array_merge(['t_id' => 1, 't_account' => 1, 't_amt' => '0'], $attrs));

        return $tx;
    }

    // -------------------------------------------------------------------------
    // Amount evaluator
    // -------------------------------------------------------------------------

    public function test_amount_above_matches(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '150.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'ABOVE', 'value' => '100']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_amount_above_does_not_match(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '50.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'ABOVE', 'value' => '100']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_amount_below_matches(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '50.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'BELOW', 'value' => '100']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_amount_below_does_not_match(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '150.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'BELOW', 'value' => '100']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_amount_exactly_matches(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '100.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'EXACTLY', 'value' => '100']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_amount_exactly_with_negative_uses_abs(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '-100.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'EXACTLY', 'value' => '100']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_amount_between_matches(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '75.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'BETWEEN', 'value' => '50', 'value_extra' => '100']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_amount_between_does_not_match(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '150.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'BETWEEN', 'value' => '50', 'value_extra' => '100']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_amount_between_boundary_inclusive(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $txLow = $this->makeTransaction(['t_amt' => '50.00']);
        $txHigh = $this->makeTransaction(['t_amt' => '100.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'BETWEEN', 'value' => '50', 'value_extra' => '100']);
        $this->assertTrue($evaluator->matches($txLow, $condition));
        $this->assertTrue($evaluator->matches($txHigh, $condition));
    }

    public function test_amount_unknown_operator_returns_false(): void
    {
        $evaluator = new AmountConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '100.00']);
        $condition = $this->makeCondition(['type' => 'amount', 'operator' => 'INVALID', 'value' => '100']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    // -------------------------------------------------------------------------
    // Stock symbol evaluator
    // -------------------------------------------------------------------------

    public function test_stock_symbol_have_matches(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'AAPL']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'HAVE']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_have_does_not_match_null(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => null]);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'HAVE']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_have_does_not_match_empty(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => '  ']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'HAVE']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_do_not_have_matches(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => null]);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'DO_NOT_HAVE']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_do_not_have_fails_with_symbol(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'MSFT']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'DO_NOT_HAVE']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_matches_exact(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'AAPL']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => 'AAPL']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_matches_one_of_comma_list(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'TSLA']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => 'AAPL, TSLA, MSFT']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_does_not_match_absent_symbol(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'NVDA']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => 'AAPL, TSLA']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_case_insensitive(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'aapl']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => 'AAPL']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_trims_whitespace_in_list(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'AAPL']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => ' AAPL , TSLA ']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_does_not_match_null_symbol(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => null]);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => 'AAPL']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_stock_symbol_is_symbol_ignores_blank_entries_in_list(): void
    {
        $evaluator = new StockSymbolConditionEvaluator;
        $tx = $this->makeTransaction(['t_symbol' => 'AAPL']);
        $condition = $this->makeCondition(['type' => 'stock_symbol_presence', 'operator' => 'IS_SYMBOL', 'value' => 'AAPL,,, TSLA']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    // -------------------------------------------------------------------------
    // Option type evaluator
    // -------------------------------------------------------------------------

    public function test_option_type_any_matches(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => 'C']);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'ANY']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_option_type_any_does_not_match_null(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => null]);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'ANY']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_option_type_call_matches(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => 'C']);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'CALL']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_option_type_call_matches_full_word(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => 'call']);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'CALL']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_option_type_put_matches(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => 'P']);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'PUT']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_option_type_call_does_not_match_put(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => 'P']);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'CALL']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_option_type_put_does_not_match_call(): void
    {
        $evaluator = new OptionTypeConditionEvaluator;
        $tx = $this->makeTransaction(['opt_type' => 'C']);
        $condition = $this->makeCondition(['type' => 'option_type', 'operator' => 'PUT']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    // -------------------------------------------------------------------------
    // Account evaluator
    // -------------------------------------------------------------------------

    public function test_account_matches(): void
    {
        $evaluator = new AccountConditionEvaluator;
        $tx = $this->makeTransaction(['t_account' => 42]);
        $condition = $this->makeCondition(['type' => 'account_id', 'operator' => 'EQUALS', 'value' => '42']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_account_does_not_match(): void
    {
        $evaluator = new AccountConditionEvaluator;
        $tx = $this->makeTransaction(['t_account' => 42]);
        $condition = $this->makeCondition(['type' => 'account_id', 'operator' => 'EQUALS', 'value' => '99']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_account_unknown_operator_returns_false(): void
    {
        $evaluator = new AccountConditionEvaluator;
        $tx = $this->makeTransaction(['t_account' => 42]);
        $condition = $this->makeCondition(['type' => 'account_id', 'operator' => 'NOT_EQUALS', 'value' => '42']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    // -------------------------------------------------------------------------
    // Direction evaluator
    // -------------------------------------------------------------------------

    public function test_direction_income_matches(): void
    {
        $evaluator = new DirectionConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '100.00']);
        $condition = $this->makeCondition(['type' => 'direction', 'operator' => 'INCOME']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_direction_expense_matches(): void
    {
        $evaluator = new DirectionConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '-50.00']);
        $condition = $this->makeCondition(['type' => 'direction', 'operator' => 'EXPENSE']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_direction_income_does_not_match_expense(): void
    {
        $evaluator = new DirectionConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '-50.00']);
        $condition = $this->makeCondition(['type' => 'direction', 'operator' => 'INCOME']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_direction_expense_does_not_match_income(): void
    {
        $evaluator = new DirectionConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '50.00']);
        $condition = $this->makeCondition(['type' => 'direction', 'operator' => 'EXPENSE']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_direction_zero_is_neither_income_nor_expense(): void
    {
        $evaluator = new DirectionConditionEvaluator;
        $tx = $this->makeTransaction(['t_amt' => '0.00']);
        $incomeCondition = $this->makeCondition(['type' => 'direction', 'operator' => 'INCOME']);
        $expenseCondition = $this->makeCondition(['type' => 'direction', 'operator' => 'EXPENSE']);
        $this->assertFalse($evaluator->matches($tx, $incomeCondition));
        $this->assertFalse($evaluator->matches($tx, $expenseCondition));
    }

    // -------------------------------------------------------------------------
    // Description contains evaluator
    // -------------------------------------------------------------------------

    public function test_description_contains_matches_description(): void
    {
        $evaluator = new DescriptionContainsConditionEvaluator;
        $tx = $this->makeTransaction(['t_description' => 'Payment from Amazon']);
        $condition = $this->makeCondition(['type' => 'description_contains', 'operator' => 'CONTAINS', 'value' => 'amazon']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_description_contains_is_case_insensitive(): void
    {
        $evaluator = new DescriptionContainsConditionEvaluator;
        $tx = $this->makeTransaction(['t_description' => 'AMAZON PRIME']);
        $condition = $this->makeCondition(['type' => 'description_contains', 'operator' => 'CONTAINS', 'value' => 'amazon']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_description_contains_matches_comment(): void
    {
        $evaluator = new DescriptionContainsConditionEvaluator;
        $tx = $this->makeTransaction(['t_description' => 'Other', 't_comment' => 'Amazon purchase']);
        $condition = $this->makeCondition(['type' => 'description_contains', 'operator' => 'CONTAINS', 'value' => 'Amazon']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_description_contains_fails_when_absent(): void
    {
        $evaluator = new DescriptionContainsConditionEvaluator;
        $tx = $this->makeTransaction(['t_description' => 'Payment from Store', 't_comment' => null]);
        $condition = $this->makeCondition(['type' => 'description_contains', 'operator' => 'CONTAINS', 'value' => 'Amazon']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }

    public function test_description_not_contains_matches(): void
    {
        $evaluator = new DescriptionContainsConditionEvaluator;
        $tx = $this->makeTransaction(['t_description' => 'Payment from Store', 't_comment' => null]);
        $condition = $this->makeCondition(['type' => 'description_contains', 'operator' => 'NOT_CONTAINS', 'value' => 'Amazon']);
        $this->assertTrue($evaluator->matches($tx, $condition));
    }

    public function test_description_not_contains_fails_when_present(): void
    {
        $evaluator = new DescriptionContainsConditionEvaluator;
        $tx = $this->makeTransaction(['t_description' => 'Amazon Prime']);
        $condition = $this->makeCondition(['type' => 'description_contains', 'operator' => 'NOT_CONTAINS', 'value' => 'Amazon']);
        $this->assertFalse($evaluator->matches($tx, $condition));
    }
}
