<?php

namespace App\Finance\RulesEngine\DTOs;

class ActionResult
{
    public function __construct(
        public readonly bool $applied,
        public readonly string $summary,
        public readonly bool $stopProcessing = false,
        public readonly ?string $error = null,
    ) {}
}
