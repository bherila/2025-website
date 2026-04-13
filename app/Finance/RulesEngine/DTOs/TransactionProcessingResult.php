<?php

namespace App\Finance\RulesEngine\DTOs;

class TransactionProcessingResult
{
    public function __construct(
        public readonly int $transactionId,
        public readonly int $rulesMatched,
        public readonly int $actionsApplied,
        /** @var array<int, string> */
        public readonly array $errors = [],
    ) {}
}
