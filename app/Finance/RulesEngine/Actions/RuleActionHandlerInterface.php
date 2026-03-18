<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

interface RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult;
}
