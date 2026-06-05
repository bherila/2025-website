<?php

namespace App\Services\Finance\TaxPreviewFacts\Data;

readonly class EquityCompensationFacts
{
    /**
     * @var list<array{year:int,taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,sourceIds:list<string>}>
     */
    public array $annual;

    /**
     * @var array{taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,totalValue:array{low:float,medium:float,high:float}}
     */
    public array $lifetime;

    /**
     * @var TaxFactSource[]
     */
    public array $sources;

    /**
     * @var list<array{year:int,facts:Form6251Facts}>
     */
    public array $form6251;

    /**
     * @param  list<array{year:int,taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,sourceIds:list<string>}>  $annual
     * @param  array{taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,totalValue:array{low:float,medium:float,high:float}}  $lifetime
     * @param  TaxFactSource[]  $sources
     * @param  list<array{year:int,facts:Form6251Facts}>  $form6251
     */
    public function __construct(array $annual, array $lifetime, array $sources, array $form6251)
    {
        $this->annual = $annual;
        $this->lifetime = $lifetime;
        $this->sources = $sources;
        $this->form6251 = $form6251;
    }

    /**
     * @return array{annual:list<array{year:int,taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,sourceIds:list<string>}>,lifetime:array{taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,totalValue:array{low:float,medium:float,high:float}},sources:list<array<string, mixed>>,form6251:list<array{year:int,facts:array<string, mixed>}>}
     */
    public function toArray(): array
    {
        return [
            'annual' => $this->annual,
            'lifetime' => $this->lifetime,
            'sources' => array_map(static fn (TaxFactSource $source): array => $source->toArray(), $this->sources),
            'form6251' => array_map(
                static fn (array $entry): array => [
                    'year' => $entry['year'],
                    'facts' => $entry['facts']->toArray(),
                ],
                $this->form6251,
            ),
        ];
    }
}
