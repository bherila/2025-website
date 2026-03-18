<?php

namespace App\Finance\RulesEngine;

use App\Models\FinanceTool\FinRule;
use App\Models\User;
use Illuminate\Database\Eloquent\Collection;

class TransactionRuleLoader
{
    public function loadActiveRules(User $user): Collection
    {
        return FinRule::where('user_id', $user->id)
            ->where('is_disabled', false)
            ->orderBy('order')
            ->with(['conditions', 'actions'])
            ->get();
    }

    public function loadAllRules(User $user): Collection
    {
        return FinRule::where('user_id', $user->id)
            ->orderBy('order')
            ->with(['conditions', 'actions'])
            ->get();
    }
}
