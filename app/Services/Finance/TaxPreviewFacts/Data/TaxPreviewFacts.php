<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class TaxPreviewFacts
{
    public function __construct(
        public int $year,
        public Schedule1Facts $schedule1,
        public ScheduleBFacts $scheduleB,
        public Form4952Facts $form4952,
        public ScheduleAFacts $scheduleA,
        public ScheduleEFacts $scheduleE,
        public ScheduleDFacts $scheduleD,
        public Form8949Facts $form8949,
        public Form1116Facts $form1116,
        public Form8960Facts $form8960,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'schedule1' => $this->schedule1->toArray(),
            'scheduleB' => $this->scheduleB->toArray(),
            'form4952' => $this->form4952->toArray(),
            'scheduleA' => $this->scheduleA->toArray(),
            'scheduleE' => $this->scheduleE->toArray(),
            'scheduleD' => $this->scheduleD->toArray(),
            'form8949' => $this->form8949->toArray(),
            'form1116' => $this->form1116->toArray(),
            'form8960' => $this->form8960->toArray(),
        ];
    }
}
