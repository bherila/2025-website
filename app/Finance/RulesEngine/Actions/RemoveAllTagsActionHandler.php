<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

class RemoveAllTagsActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $affected = FinAccountLineItemTagMap::where('t_id', $tx->t_id)
            ->delete();

        return new ActionResult(applied: true, summary: "Removed all tags ({$affected} cleared)");
    }
}
