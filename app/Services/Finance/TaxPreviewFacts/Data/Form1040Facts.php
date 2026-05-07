<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

use Spatie\TypeScriptTransformer\Attributes\TypeScript;

#[TypeScript]
readonly class Form1040Facts
{
    /**
     * @var TaxFactSource[]
     */
    public array $line1zSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line2aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line2bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line3aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line3bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line4aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line4bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line5aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line5bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line6aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line6bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line7Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line8Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line10Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line12Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line13Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line16Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line17Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line20Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line23Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line25aSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line25bSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line25cSources;

    /**
     * @var TaxFactSource[]
     */
    public array $line26Sources;

    /**
     * @var TaxFactSource[]
     */
    public array $line31Sources;

    /**
     * @param  TaxFactSource[]  $line1zSources
     * @param  TaxFactSource[]  $line2aSources
     * @param  TaxFactSource[]  $line2bSources
     * @param  TaxFactSource[]  $line3aSources
     * @param  TaxFactSource[]  $line3bSources
     * @param  TaxFactSource[]  $line4aSources
     * @param  TaxFactSource[]  $line4bSources
     * @param  TaxFactSource[]  $line5aSources
     * @param  TaxFactSource[]  $line5bSources
     * @param  TaxFactSource[]  $line6aSources
     * @param  TaxFactSource[]  $line6bSources
     * @param  TaxFactSource[]  $line7Sources
     * @param  TaxFactSource[]  $line8Sources
     * @param  TaxFactSource[]  $line10Sources
     * @param  TaxFactSource[]  $line12Sources
     * @param  TaxFactSource[]  $line13Sources
     * @param  TaxFactSource[]  $line16Sources
     * @param  TaxFactSource[]  $line17Sources
     * @param  TaxFactSource[]  $line20Sources
     * @param  TaxFactSource[]  $line23Sources
     * @param  TaxFactSource[]  $line25aSources
     * @param  TaxFactSource[]  $line25bSources
     * @param  TaxFactSource[]  $line25cSources
     * @param  TaxFactSource[]  $line26Sources
     * @param  TaxFactSource[]  $line31Sources
     */
    public function __construct(
        public string $filingStatus,
        array $line1zSources,
        public float $line1z,
        array $line2aSources,
        public float $line2a,
        array $line2bSources,
        public float $line2b,
        array $line3aSources,
        public float $line3a,
        array $line3bSources,
        public float $line3b,
        array $line4aSources,
        public float $line4a,
        array $line4bSources,
        public float $line4b,
        array $line5aSources,
        public float $line5a,
        array $line5bSources,
        public float $line5b,
        array $line6aSources,
        public float $line6a,
        array $line6bSources,
        public float $line6b,
        array $line7Sources,
        public float $line7,
        array $line8Sources,
        public float $line8,
        public float $line9,
        array $line10Sources,
        public float $line10,
        public float $line11,
        public string $line12Source,
        array $line12Sources,
        public float $line12,
        array $line13Sources,
        public float $line13,
        public float $line14,
        public float $line15,
        public string $line16TaxComputation,
        array $line16Sources,
        public float $line16,
        array $line17Sources,
        public float $line17,
        public float $line18,
        public float $line19,
        array $line20Sources,
        public float $line20,
        public float $line21,
        public float $line22,
        array $line23Sources,
        public float $line23,
        public float $line24,
        array $line25aSources,
        public float $line25a,
        array $line25bSources,
        public float $line25b,
        array $line25cSources,
        public float $line25c,
        public float $line25d,
        array $line26Sources,
        public float $line26,
        array $line31Sources,
        public float $line31,
        public float $line32,
        public float $line33,
        public float $line34,
        public float $line35a,
        public float $line36,
        public float $line37,
        public float $line38,
    ) {
        $this->line1zSources = $line1zSources;
        $this->line2aSources = $line2aSources;
        $this->line2bSources = $line2bSources;
        $this->line3aSources = $line3aSources;
        $this->line3bSources = $line3bSources;
        $this->line4aSources = $line4aSources;
        $this->line4bSources = $line4bSources;
        $this->line5aSources = $line5aSources;
        $this->line5bSources = $line5bSources;
        $this->line6aSources = $line6aSources;
        $this->line6bSources = $line6bSources;
        $this->line7Sources = $line7Sources;
        $this->line8Sources = $line8Sources;
        $this->line10Sources = $line10Sources;
        $this->line12Sources = $line12Sources;
        $this->line13Sources = $line13Sources;
        $this->line16Sources = $line16Sources;
        $this->line17Sources = $line17Sources;
        $this->line20Sources = $line20Sources;
        $this->line23Sources = $line23Sources;
        $this->line25aSources = $line25aSources;
        $this->line25bSources = $line25bSources;
        $this->line25cSources = $line25cSources;
        $this->line26Sources = $line26Sources;
        $this->line31Sources = $line31Sources;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'filingStatus' => $this->filingStatus,
            'line1zSources' => $this->sourcesToArray($this->line1zSources),
            'line1z' => $this->line1z,
            'line2aSources' => $this->sourcesToArray($this->line2aSources),
            'line2a' => $this->line2a,
            'line2bSources' => $this->sourcesToArray($this->line2bSources),
            'line2b' => $this->line2b,
            'line3aSources' => $this->sourcesToArray($this->line3aSources),
            'line3a' => $this->line3a,
            'line3bSources' => $this->sourcesToArray($this->line3bSources),
            'line3b' => $this->line3b,
            'line4aSources' => $this->sourcesToArray($this->line4aSources),
            'line4a' => $this->line4a,
            'line4bSources' => $this->sourcesToArray($this->line4bSources),
            'line4b' => $this->line4b,
            'line5aSources' => $this->sourcesToArray($this->line5aSources),
            'line5a' => $this->line5a,
            'line5bSources' => $this->sourcesToArray($this->line5bSources),
            'line5b' => $this->line5b,
            'line6aSources' => $this->sourcesToArray($this->line6aSources),
            'line6a' => $this->line6a,
            'line6bSources' => $this->sourcesToArray($this->line6bSources),
            'line6b' => $this->line6b,
            'line7Sources' => $this->sourcesToArray($this->line7Sources),
            'line7' => $this->line7,
            'line8Sources' => $this->sourcesToArray($this->line8Sources),
            'line8' => $this->line8,
            'line9' => $this->line9,
            'line10Sources' => $this->sourcesToArray($this->line10Sources),
            'line10' => $this->line10,
            'line11' => $this->line11,
            'line12Source' => $this->line12Source,
            'line12Sources' => $this->sourcesToArray($this->line12Sources),
            'line12' => $this->line12,
            'line13Sources' => $this->sourcesToArray($this->line13Sources),
            'line13' => $this->line13,
            'line14' => $this->line14,
            'line15' => $this->line15,
            'line16TaxComputation' => $this->line16TaxComputation,
            'line16Sources' => $this->sourcesToArray($this->line16Sources),
            'line16' => $this->line16,
            'line17Sources' => $this->sourcesToArray($this->line17Sources),
            'line17' => $this->line17,
            'line18' => $this->line18,
            'line19' => $this->line19,
            'line20Sources' => $this->sourcesToArray($this->line20Sources),
            'line20' => $this->line20,
            'line21' => $this->line21,
            'line22' => $this->line22,
            'line23Sources' => $this->sourcesToArray($this->line23Sources),
            'line23' => $this->line23,
            'line24' => $this->line24,
            'line25aSources' => $this->sourcesToArray($this->line25aSources),
            'line25a' => $this->line25a,
            'line25bSources' => $this->sourcesToArray($this->line25bSources),
            'line25b' => $this->line25b,
            'line25cSources' => $this->sourcesToArray($this->line25cSources),
            'line25c' => $this->line25c,
            'line25d' => $this->line25d,
            'line26Sources' => $this->sourcesToArray($this->line26Sources),
            'line26' => $this->line26,
            'line31Sources' => $this->sourcesToArray($this->line31Sources),
            'line31' => $this->line31,
            'line32' => $this->line32,
            'line33' => $this->line33,
            'line34' => $this->line34,
            'line35a' => $this->line35a,
            'line36' => $this->line36,
            'line37' => $this->line37,
            'line38' => $this->line38,
        ];
    }

    /**
     * @param  TaxFactSource[]  $sources
     * @return array<int, array<string, mixed>>
     */
    private function sourcesToArray(array $sources): array
    {
        return array_map(static fn (TaxFactSource $source): array => $source->toArray(), $sources);
    }
}
