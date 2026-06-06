<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\EquityCompensationFacts;
use App\Services\Finance\TaxPreviewFacts\Data\Form6251SourceEntryFact;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;
use App\Services\Planning\CareerComp\EquityValuationService;
use App\Services\Planning\CareerComp\JobSpec;
use App\Support\Finance\FederalIncomeTax;

class EquityCompensationFactsBuilder extends TaxPreviewFactBuilder
{
    private readonly EquityValuationService $equityValuationService;

    private readonly Form6251FactsBuilder $form6251FactsBuilder;

    public function __construct(
        ?K1CodeCharacterResolver $k1CodeCharacterResolver = null,
        ?EquityValuationService $equityValuationService = null,
        ?Form6251FactsBuilder $form6251FactsBuilder = null,
    ) {
        $resolver = $k1CodeCharacterResolver ?? new K1CodeCharacterResolver;

        parent::__construct($resolver);

        $this->equityValuationService = $equityValuationService ?? new EquityValuationService;
        $this->form6251FactsBuilder = $form6251FactsBuilder ?? new Form6251FactsBuilder($resolver);
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $vestingRows
     * @param  list<array{year:int,salary:float,bonus:float,vestedLiquidEquity:float,shareSaleProceeds:float,exerciseOutlay:float,freeCashFlow:float}>  $annualRows
     * @param  array{low:float,medium:float,high:float}  $preTaxTotalValue
     */
    public function build(JobSpec $job, array $vestingRows, array $annualRows, array $preTaxTotalValue): EquityCompensationFacts
    {
        $startYear = (int) ($annualRows[0]['year'] ?? date('Y'));
        $sources = [];
        $annual = [];
        $form6251 = [];
        $lifetime = [
            'taxableCompIncome' => 0.0,
            'nsoOrdinaryIncome' => 0.0,
            'isoAmtPreference' => 0.0,
            'equitySaleProceeds' => 0.0,
            'estimatedRegularTax' => 0.0,
            'estimatedAmt' => 0.0,
            'totalEstimatedTax' => 0.0,
            'freeCashFlow' => 0.0,
            'totalValue' => ['low' => 0.0, 'medium' => 0.0, 'high' => 0.0],
        ];

        foreach ($annualRows as $annualRow) {
            $year = (int) $annualRow['year'];
            $cashComp = MoneyMath::add($annualRow['salary'], $annualRow['bonus']);
            $yearSources = [];
            $form6251SourceEntries = [];
            $optionFacts = $this->optionFactsForYear($job, $vestingRows, $year, $startYear);

            foreach ($optionFacts['sources'] as $source) {
                $sources[] = $source;
                $yearSources[] = $source->id;
            }
            foreach ($optionFacts['form6251SourceEntries'] as $sourceEntry) {
                $form6251SourceEntries[] = $sourceEntry;
            }

            $equitySaleProceeds = MoneyMath::round($annualRow['shareSaleProceeds']);
            if ($equitySaleProceeds !== 0.0) {
                $source = $this->equitySaleSource($job, $year, $equitySaleProceeds);
                $sources[] = $source;
                $yearSources[] = $source->id;
            }

            $taxableCompIncome = MoneyMath::add($cashComp, $optionFacts['nsoOrdinaryIncome']);
            $estimatedRegularTax = MoneyMath::round(FederalIncomeTax::ordinaryTax($taxableCompIncome, $year, false));
            $form6251Facts = $this->form6251FactsBuilder->buildFromOtherAdjustments(
                taxableIncome: $taxableCompIncome,
                line3OtherAdjustments: $optionFacts['isoAmtPreference'],
                year: $year,
                isMarried: false,
                regularTax: $estimatedRegularTax,
                sourceEntries: $form6251SourceEntries,
            );
            $estimatedAmt = MoneyMath::round($form6251Facts->amt);
            $totalEstimatedTax = MoneyMath::add($estimatedRegularTax, $estimatedAmt);
            $freeCashFlow = MoneyMath::subtract($annualRow['freeCashFlow'], $totalEstimatedTax);

            if ($optionFacts['isoAmtPreference'] !== 0.0 || $form6251Facts->amt !== 0.0) {
                $form6251[] = ['year' => $year, 'facts' => $form6251Facts];
            }

            $annual[] = [
                'year' => $year,
                'taxableCompIncome' => $taxableCompIncome,
                'nsoOrdinaryIncome' => $optionFacts['nsoOrdinaryIncome'],
                'isoAmtPreference' => $optionFacts['isoAmtPreference'],
                'equitySaleProceeds' => $equitySaleProceeds,
                'estimatedRegularTax' => $estimatedRegularTax,
                'estimatedAmt' => $estimatedAmt,
                'totalEstimatedTax' => $totalEstimatedTax,
                'freeCashFlow' => $freeCashFlow,
                'sourceIds' => $yearSources,
            ];

            $lifetime['taxableCompIncome'] = MoneyMath::add($lifetime['taxableCompIncome'], $taxableCompIncome);
            $lifetime['nsoOrdinaryIncome'] = MoneyMath::add($lifetime['nsoOrdinaryIncome'], $optionFacts['nsoOrdinaryIncome']);
            $lifetime['isoAmtPreference'] = MoneyMath::add($lifetime['isoAmtPreference'], $optionFacts['isoAmtPreference']);
            $lifetime['equitySaleProceeds'] = MoneyMath::add($lifetime['equitySaleProceeds'], $equitySaleProceeds);
            $lifetime['estimatedRegularTax'] = MoneyMath::add($lifetime['estimatedRegularTax'], $estimatedRegularTax);
            $lifetime['estimatedAmt'] = MoneyMath::add($lifetime['estimatedAmt'], $estimatedAmt);
            $lifetime['totalEstimatedTax'] = MoneyMath::add($lifetime['totalEstimatedTax'], $totalEstimatedTax);
            $lifetime['freeCashFlow'] = MoneyMath::add($lifetime['freeCashFlow'], $freeCashFlow);
        }

        $lifetime['totalValue'] = [
            'low' => MoneyMath::subtract($preTaxTotalValue['low'], $lifetime['totalEstimatedTax']),
            'medium' => MoneyMath::subtract($preTaxTotalValue['medium'], $lifetime['totalEstimatedTax']),
            'high' => MoneyMath::subtract($preTaxTotalValue['high'], $lifetime['totalEstimatedTax']),
        ];

        return new EquityCompensationFacts($annual, $lifetime, $sources, $form6251);
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $vestingRows
     * @return array{nsoOrdinaryIncome:float,isoAmtPreference:float,sources:TaxFactSource[],form6251SourceEntries:Form6251SourceEntryFact[]}
     */
    private function optionFactsForYear(JobSpec $job, array $vestingRows, int $year, int $startYear): array
    {
        $nsoOrdinaryIncome = 0.0;
        $isoAmtPreference = 0.0;
        $sources = [];
        $form6251SourceEntries = [];

        foreach ($vestingRows as $row) {
            if ((int) $row['year'] !== $year || ! in_array($row['type'], ['iso', 'nso'], true)) {
                continue;
            }

            $grant = $this->optionGrant($job, $row['grantId']);
            $bargainElement = $this->bargainElement($job, $row, $year - $startYear);

            if ($row['type'] === 'iso') {
                $isoAmtPreference = MoneyMath::add($isoAmtPreference, $bargainElement);
                if ($bargainElement !== 0.0) {
                    $source = $this->optionSource(
                        job: $job,
                        row: $row,
                        year: $year,
                        amount: $bargainElement,
                        sourceType: TaxFactSourceType::EquityCompIsoBargainElement,
                        routing: TaxFactRouting::Form6251IsoBargainElement,
                        routingReason: 'ISO bargain element is an AMT adjustment routed to Form 6251 line 3 for the career-comparison projection.',
                    );
                    $sources[] = $source;
                    $form6251SourceEntries[] = new Form6251SourceEntryFact(
                        label: $source->label,
                        code: 'ISO',
                        line: '3',
                        amount: $bargainElement,
                        description: 'ISO bargain element from career-comparison option exercise',
                    );
                }
            } else {
                $nsoOrdinaryIncome = MoneyMath::add($nsoOrdinaryIncome, $bargainElement);
                if ($bargainElement !== 0.0) {
                    $sources[] = $this->optionSource(
                        job: $job,
                        row: $row,
                        year: $year,
                        amount: $bargainElement,
                        sourceType: TaxFactSourceType::EquityCompNsoOrdinaryIncome,
                        routing: TaxFactRouting::Form1040NsoOrdinaryIncome,
                        routingReason: 'NSO bargain element is ordinary compensation income for the career-comparison projection.',
                    );
                }
            }

            if (filter_var($grant['earlyExercise83b'] ?? false, FILTER_VALIDATE_BOOL)) {
                $sources[] = $this->optionSource(
                    job: $job,
                    row: $row,
                    year: $year,
                    amount: $bargainElement,
                    sourceType: TaxFactSourceType::EquityComp83bElection,
                    routing: TaxFactRouting::EquityComp83bElection,
                    routingReason: 'Early exercise with an 83(b) election recognizes the option bargain element in the exercise year.',
                );
            }
        }

        return [
            'nsoOrdinaryIncome' => $nsoOrdinaryIncome,
            'isoAmtPreference' => $isoAmtPreference,
            'sources' => $sources,
            'form6251SourceEntries' => $form6251SourceEntries,
        ];
    }

    /**
     * @param  array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}  $row
     */
    private function bargainElement(JobSpec $job, array $row, int $yearOffset): float
    {
        $strike = $this->strikeForGrant($job, $row['grantId']);
        $sharePrice = $this->equityValuationService->sharePrice($job, max(0, $yearOffset), 'medium');
        $marketValue = MoneyMath::multiply($sharePrice, $row['exercisableShares']);
        $exerciseOutlay = MoneyMath::multiply($strike, $row['exercisableShares']);

        return max(0.0, MoneyMath::subtract($marketValue, $exerciseOutlay));
    }

    private function strikeForGrant(JobSpec $job, string $grantId): float
    {
        $grant = $this->optionGrant($job, $grantId);

        return is_numeric($grant['strike'] ?? null) ? (float) $grant['strike'] : 0.0;
    }

    /**
     * @return array<string, mixed>
     */
    private function optionGrant(JobSpec $job, string $grantId): array
    {
        foreach ($job->optionGrants() as $grant) {
            if ((string) ($grant['id'] ?? '') === $grantId) {
                return $grant;
            }
        }

        return [];
    }

    /**
     * @param  array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}  $row
     */
    private function optionSource(JobSpec $job, array $row, int $year, float $amount, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason): TaxFactSource
    {
        return new TaxFactSource(
            id: $this->sourceId($job, $year, $row['grantId'], $sourceType->value),
            label: "{$job->name()} {$row['grantId']} {$row['type']} equity compensation",
            amount: $amount,
            sourceType: $sourceType,
            formType: 'career_comparison_projection',
            routing: $routing,
            routingReason: $routingReason,
            notes: 'Generated by the career-comparison equity-compensation tax facts builder.',
        );
    }

    private function equitySaleSource(JobSpec $job, int $year, float $amount): TaxFactSource
    {
        return new TaxFactSource(
            id: $this->sourceId($job, $year, 'equity-sale', TaxFactSourceType::EquityCompSaleProceeds->value),
            label: "{$job->name()} equity sale proceeds",
            amount: $amount,
            sourceType: TaxFactSourceType::EquityCompSaleProceeds,
            formType: 'career_comparison_projection',
            routing: TaxFactRouting::ScheduleDEquitySaleProceeds,
            routingReason: 'Career comparison liquid equity proceeds are routed as Schedule D review inputs until basis and holding period are known.',
            notes: 'Projection records gross proceeds only; cost basis and holding period remain outside this model.',
        );
    }

    private function sourceId(JobSpec $job, int $year, string $subject, string $sourceType): string
    {
        $raw = "{$job->id()}-{$year}-{$subject}-{$sourceType}";
        $normalized = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $raw) ?? $raw);

        return 'cc-'.trim($normalized, '-');
    }
}
