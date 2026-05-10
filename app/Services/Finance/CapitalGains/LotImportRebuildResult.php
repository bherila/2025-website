<?php

namespace App\Services\Finance\CapitalGains;

class LotImportRebuildResult
{
    /**
     * @param  list<string>  $warnings
     * @param  list<int>  $lotIds
     */
    public function __construct(
        public readonly int $insertedCount,
        public readonly int $deletedCount,
        public readonly array $warnings,
        public readonly array $lotIds,
        public readonly bool $dryRun = false,
    ) {}

    /**
     * @return array{insertedCount: int, deletedCount: int, warnings: list<string>, lotIds: list<int>}
     */
    public function toArray(): array
    {
        return [
            'insertedCount' => $this->insertedCount,
            'deletedCount' => $this->deletedCount,
            'warnings' => $this->warnings,
            'lotIds' => $this->lotIds,
        ];
    }
}
