<?php

namespace Tests\Feature\FinanceRulesEngine;

use App\Finance\RulesEngine\Actions\NegateAmountActionHandler;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinRuleAction;
use Tests\TestCase;

class NegateAmountActionHandlerPrecisionTest extends TestCase
{
    public function test_negate_amount_preserves_four_decimal_precision(): void
    {
        $user = $this->createUser();
        $this->actingAs($user);
        $account = FinAccounts::create(['acct_name' => 'Precision Account']);
        $transaction = FinAccountLineItems::create([
            't_account' => $account->acct_id,
            't_date' => '2025-01-15',
            't_amt' => '1.2345',
            't_description' => 'Fractional amount',
        ]);
        $action = new FinRuleAction;
        $action->forceFill([
            'type' => 'negate_amount',
            'order' => 1,
        ]);

        $handler = new NegateAmountActionHandler;
        $handler->apply($transaction, $action, $user);

        $transaction->refresh();
        $this->assertSame('-1.2345', number_format((float) $transaction->t_amt, 4, '.', ''));

        $handler->apply($transaction, $action, $user);

        $transaction->refresh();
        $this->assertSame('1.2345', number_format((float) $transaction->t_amt, 4, '.', ''));
    }
}
