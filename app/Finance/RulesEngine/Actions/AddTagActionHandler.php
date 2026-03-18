<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItemTagMap;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

class AddTagActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $tagId = (int) $action->target;

        FinAccountLineItemTagMap::updateOrCreate(
            ['t_id' => $tx->t_id, 'tag_id' => $tagId],
            ['when_deleted' => null],
        );

        return new ActionResult(applied: true, summary: "Added tag {$tagId}");
    }
}
