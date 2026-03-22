<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

class SetMemoActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $tx->t_comment = $action->target;
        $tx->save();
        $tx->refresh();

        return new ActionResult(applied: true, summary: "Set memo to \"{$action->target}\"");
    }
}
