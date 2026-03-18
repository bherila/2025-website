<?php

namespace App\Finance\RulesEngine\DTOs;

class RuleRunSummary
{
    public function __construct(
        public readonly int $transactionsProcessed,
        public readonly int $rulesMatched,
        public readonly int $actionsApplied,
        public readonly int $errors,
        public readonly array $transactionResults = [],
    ) {}
}
