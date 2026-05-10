<?php

namespace App\Services\Finance\CapitalGains;

class LotMatchProposal
{
    /**
     * @param  array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}  $deltas
     */
    public function __construct(
        public readonly ?int $brokerLotId,
        public readonly ?int $accountLotId,
        public readonly string $state,
        public readonly string $reasonCode,
        public readonly float $score,
        public readonly array $deltas,
        public readonly ?string $notes = null,
    ) {}

    public function key(): string
    {
        return ($this->brokerLotId ?? 'null').'|'.($this->accountLotId ?? 'null');
    }

    /**
     * @return array{reason_code: string, score: float, deltas: array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}, notes: string|null}
     */
    public function matchReason(): array
    {
        return [
            'reason_code' => $this->reasonCode,
            'score' => $this->score,
            'deltas' => $this->deltas,
            'notes' => $this->notes,
        ];
    }

    /**
     * @return array{brokerLotId: int|null, accountLotId: int|null, state: string, matchReason: array{reason_code: string, score: float, deltas: array{proceeds: float|null, basis: float|null, wash: float|null, qty: float|null, date_days: int|null}, notes: string|null}}
     */
    public function toArray(): array
    {
        return [
            'brokerLotId' => $this->brokerLotId,
            'accountLotId' => $this->accountLotId,
            'state' => $this->state,
            'matchReason' => $this->matchReason(),
        ];
    }
}
