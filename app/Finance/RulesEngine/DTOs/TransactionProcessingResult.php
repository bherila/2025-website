<?php

namespace App\Finance\RulesEngine\DTOs;

class TransactionProcessingResult
{
    public function __construct(
        public readonly int $transactionId,
        public readonly int $rulesMatched,
        public readonly int $actionsApplied,
        public readonly array $errors = [],
    ) {}
}
