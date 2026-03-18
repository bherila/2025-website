<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

class FindReplaceActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $search = $action->target ?? '';
        $replace = $action->payload ?? '';

        $tx->t_description = str_ireplace($search, $replace, $tx->t_description ?? '');
        $tx->t_comment = str_ireplace($search, $replace, $tx->t_comment ?? '');
        $tx->save();
        $tx->refresh();

        return new ActionResult(
            applied: true,
            summary: "Find/replace: \"{$search}\" → \"{$replace}\"",
        );
    }
}
