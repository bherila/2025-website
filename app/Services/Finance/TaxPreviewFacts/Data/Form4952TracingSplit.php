<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form4952TracingSplit
{
    /**
     * One Form 4952 line-1 source split under Treas. Reg. §1.163-8T.
     */
    public function __construct(
        public string $sourceId,
        public string $label,
        public float $grossInterest,
        public float $scheduleAInterest,
        public float $scheduleEInterest,
        public float $scheduleAShare,
        public float $scheduleEShare,
        public ?int $taxDocumentId = null,
        public ?string $formType = null,
        public ?string $box = null,
        public ?string $code = null,
    ) {}

    /**
     * @return array{sourceId:string,label:string,grossInterest:float,scheduleAInterest:float,scheduleEInterest:float,scheduleAShare:float,scheduleEShare:float,taxDocumentId:?int,formType:?string,box:?string,code:?string}
     */
    public function toArray(): array
    {
        return [
            'sourceId' => $this->sourceId,
            'label' => $this->label,
            'grossInterest' => $this->grossInterest,
            'scheduleAInterest' => $this->scheduleAInterest,
            'scheduleEInterest' => $this->scheduleEInterest,
            'scheduleAShare' => $this->scheduleAShare,
            'scheduleEShare' => $this->scheduleEShare,
            'taxDocumentId' => $this->taxDocumentId,
            'formType' => $this->formType,
            'box' => $this->box,
            'code' => $this->code,
        ];
    }
}
