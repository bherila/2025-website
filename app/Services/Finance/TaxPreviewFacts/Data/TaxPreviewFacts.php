<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class TaxPreviewFacts
{
    public function __construct(
        public int $year,
        public ScheduleCFacts $scheduleC,
        public ScheduleFFacts $scheduleF,
        public ScheduleSEFacts $scheduleSE,
        public Form8959Facts $form8959,
        public Schedule1Facts $schedule1,
        public Schedule3Facts $schedule3,
        public ScheduleBFacts $scheduleB,
        public Form4952Facts $form4952,
        public ScheduleAFacts $scheduleA,
        public ScheduleEFacts $scheduleE,
        public ScheduleDFacts $scheduleD,
        public Form8949Facts $form8949,
        public Form4797Facts $form4797,
        public Form8606Facts $form8606,
        public Form1116Facts $form1116,
        public Form8960Facts $form8960,
        public Form8995Facts $form8995,
        public Form6251Facts $form6251,
        public Form8582Facts $form8582,
        public Form1040Facts $form1040,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'year' => $this->year,
            'scheduleC' => $this->scheduleC->toArray(),
            'scheduleF' => $this->scheduleF->toArray(),
            'scheduleSE' => $this->scheduleSE->toArray(),
            'form8959' => $this->form8959->toArray(),
            'schedule1' => $this->schedule1->toArray(),
            'schedule3' => $this->schedule3->toArray(),
            'scheduleB' => $this->scheduleB->toArray(),
            'form4952' => $this->form4952->toArray(),
            'scheduleA' => $this->scheduleA->toArray(),
            'scheduleE' => $this->scheduleE->toArray(),
            'scheduleD' => $this->scheduleD->toArray(),
            'form8949' => $this->form8949->toArray(),
            'form4797' => $this->form4797->toArray(),
            'form8606' => $this->form8606->toArray(),
            'form1116' => $this->form1116->toArray(),
            'form8960' => $this->form8960->toArray(),
            'form8995' => $this->form8995->toArray(),
            'form6251' => $this->form6251->toArray(),
            'form8582' => $this->form8582->toArray(),
            'form1040' => $this->form1040->toArray(),
        ];
    }
}
