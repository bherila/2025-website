<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

class RemoveTagActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $tagId = (int) $action->target;

        FinAccountLineItemTagMap::where('t_id', $tx->t_id)
            ->where('tag_id', $tagId)
            ->update(['when_deleted' => now()]);

        return new ActionResult(applied: true, summary: "Removed tag {$tagId}");
    }
}
