<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;
use App\Services\Finance\MoneyMath;

class NegateAmountActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $original = $tx->t_amt;
        $tx->t_amt = MoneyMath::multiply((string) $tx->t_amt, -1);
        $tx->save();
        $tx->refresh();

        return new ActionResult(applied: true, summary: "Negated amount: {$original} → {$tx->t_amt}");
    }
}
