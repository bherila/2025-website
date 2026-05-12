<?php

namespace App\Services\Tax\PureTaxMath;

final readonly class IrmaaTier
{
    public function __construct(
        public string $label,
        public float $minMagi,
        public ?float $maxMagi,
        public float $monthlyPartBSurcharge,
        public float $monthlyPartDSurcharge,
    ) {}

    public function annualSurcharge(): float
    {
        return round(($this->monthlyPartBSurcharge + $this->monthlyPartDSurcharge) * 12.0, 2);
    }

    /**
     * @return array{label: string, minMagi: float, maxMagi: float|null, monthlyPartBSurcharge: float, monthlyPartDSurcharge: float, annualSurcharge: float}
     */
    public function toArray(): array
    {
        return [
            'label' => $this->label,
            'minMagi' => $this->minMagi,
            'maxMagi' => $this->maxMagi,
            'monthlyPartBSurcharge' => $this->monthlyPartBSurcharge,
            'monthlyPartDSurcharge' => $this->monthlyPartDSurcharge,
            'annualSurcharge' => $this->annualSurcharge(),
        ];
    }
}
