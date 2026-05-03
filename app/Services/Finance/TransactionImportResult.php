<?php

namespace App\Services\Finance;

class TransactionImportResult
{
    /**
     * @param  list<array<string, mixed>>  $rows
     * @param  list<array<string, mixed>>  $skippedRows
     * @param  list<string>  $errors
     */
    public function __construct(
        public readonly bool $dryRun,
        public readonly int $inserted,
        public readonly int $skippedDuplicate,
        public readonly array $rows = [],
        public readonly array $skippedRows = [],
        public readonly array $errors = [],
    ) {}

    public function hasErrors(): bool
    {
        return $this->errors !== [];
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'dry_run' => $this->dryRun,
            'inserted' => $this->inserted,
            'skipped_duplicate' => $this->skippedDuplicate,
            'rows' => $this->dryRun ? $this->rows : [],
            'errors' => $this->errors,
        ];
    }
}
