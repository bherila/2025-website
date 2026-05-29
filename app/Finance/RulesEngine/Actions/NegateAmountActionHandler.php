<?php

namespace App\Finance\RulesEngine\Actions;

use App\Finance\RulesEngine\DTOs\ActionResult;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinRuleAction;
use App\Models\User;

class NegateAmountActionHandler implements RuleActionHandlerInterface
{
    public function apply(FinAccountLineItems $tx, FinRuleAction $action, User $user): ActionResult
    {
        $original = $tx->t_amt;
        $tx->setAttribute('t_amt', $this->negatePreservingPrecision($tx->t_amt));
        $tx->save();
        $tx->refresh();

        return new ActionResult(applied: true, summary: "Negated amount: {$original} → {$tx->t_amt}");
    }

    private function negatePreservingPrecision(mixed $amount): string
    {
        $raw = trim((string) ($amount ?? '0'));
        if ($raw === '') {
            return '0';
        }

        $unsigned = ltrim($raw, '+-');
        if ($this->isZeroAmount($unsigned)) {
            return $unsigned === '' ? '0' : $unsigned;
        }

        return str_starts_with($raw, '-') ? $unsigned : "-{$unsigned}";
    }

    private function isZeroAmount(string $amount): bool
    {
        $digits = preg_replace('/[^0-9]+/', '', $amount) ?? '';

        return $digits === '' || trim($digits, '0') === '';
    }
}
