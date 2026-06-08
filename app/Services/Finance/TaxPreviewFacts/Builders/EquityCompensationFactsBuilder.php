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
use App\Services\Planning\CareerComp\ModelAssumptions;
use App\Services\Planning\CareerComp\PrivateValuationScenarioService;
use App\Support\Finance\FederalIncomeTax;

class EquityCompensationFactsBuilder extends TaxPreviewFactBuilder
{
    private readonly EquityValuationService $equityValuationService;

    private readonly PrivateValuationScenarioService $privateValuationScenarioService;

    private readonly Form6251FactsBuilder $form6251FactsBuilder;

    public function __construct(
        ?K1CodeCharacterResolver $k1CodeCharacterResolver = null,
        ?EquityValuationService $equityValuationService = null,
        ?PrivateValuationScenarioService $privateValuationScenarioService = null,
        ?Form6251FactsBuilder $form6251FactsBuilder = null,
    ) {
        $resolver = $k1CodeCharacterResolver ?? new K1CodeCharacterResolver;

        parent::__construct($resolver);

        $this->equityValuationService = $equityValuationService ?? new EquityValuationService;
        $this->privateValuationScenarioService = $privateValuationScenarioService ?? new PrivateValuationScenarioService;
        $this->form6251FactsBuilder = $form6251FactsBuilder ?? new Form6251FactsBuilder($resolver);
    }

    /**
     * @param  list<array{grantId:string,type:string,year:int,vestedShares:float,exercisableShares:float}>  $vestingRows
     * @param  list<array{year:int,salary:float,bonus:float,vestedLiquidEquity:float,shareSaleProceeds:float,equitySaleBasis?:float,equityCapitalGain?:float,privateRsuOrdinaryIncome?:float,exerciseOutlay:float,freeCashFlow:float}>  $annualRows
     * @param  array{low:float,medium:float,high:float}  $preTaxTotalValue
     */
    public function build(JobSpec $job, array $vestingRows, array $annualRows, array $preTaxTotalValue, ?ModelAssumptions $modelAssumptions = null): EquityCompensationFacts
    {
        $modelAssumptions ??= ModelAssumptions::fromArray([]);
        $isMarried = $modelAssumptions->isMarried();
        $startYear = (int) ($annualRows[0]['year'] ?? date('Y'));
        $sources = [];
        $annual = [];
        $form6251 = [];
        $lifetime = [
            'taxableCompIncome' => 0.0,
            'totalTaxableIncome' => 0.0,
            'nsoOrdinaryIncome' => 0.0,
            'isoAmtPreference' => 0.0,
            'equitySaleProceeds' => 0.0,
            'equityCapitalGain' => 0.0,
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
            $optionFacts = $this->optionFactsForYear($job, $vestingRows, $year, $startYear, $modelAssumptions);

            foreach ($optionFacts['sources'] as $source) {
                $sources[] = $source;
                $yearSources[] = $source->id;
            }
            foreach ($optionFacts['form6251SourceEntries'] as $sourceEntry) {
                $form6251SourceEntries[] = $sourceEntry;
            }

            $equitySaleProceeds = MoneyMath::round($annualRow['shareSaleProceeds']);
            $equityCapitalGain = MoneyMath::round($annualRow['equityCapitalGain'] ?? 0.0);
            $privateRsuOrdinaryIncome = MoneyMath::round($annualRow['privateRsuOrdinaryIncome'] ?? 0.0);
            if ($equitySaleProceeds !== 0.0) {
                $source = $this->equitySaleSource($job, $year, $equitySaleProceeds);
                $sources[] = $source;
                $yearSources[] = $source->id;
            }
            if ($equityCapitalGain !== 0.0) {
                $source = $this->equityCapitalGainSource($job, $year, $equityCapitalGain);
                $sources[] = $source;
                $yearSources[] = $source->id;
            }
            if ($privateRsuOrdinaryIncome !== 0.0) {
                $source = $this->privateRsuOrdinaryIncomeSource($job, $year, $privateRsuOrdinaryIncome);
                $sources[] = $source;
                $yearSources[] = $source->id;
            }

            $taxableCompIncome = MoneyMath::sum([$cashComp, $optionFacts['nsoOrdinaryIncome'], $privateRsuOrdinaryIncome]);
            $totalTaxableIncome = MoneyMath::add($taxableCompIncome, $equityCapitalGain);
            $estimatedRegularTax = MoneyMath::round(FederalIncomeTax::regularTax($totalTaxableIncome, $year, $isMarried, 0.0, $equityCapitalGain));
            $form6251Facts = $this->form6251FactsBuilder->buildFromOtherAdjustments(
                taxableIncome: $totalTaxableIncome,
                line3OtherAdjustments: $optionFacts['isoAmtPreference'],
                year: $year,
                isMarried: $isMarried,
                regularTax: $estimatedRegularTax,
                sourceEntries: $form6251SourceEntries,
                preferentialIncome: $equityCapitalGain,
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
                'totalTaxableIncome' => $totalTaxableIncome,
                'nsoOrdinaryIncome' => $optionFacts['nsoOrdinaryIncome'],
                'isoAmtPreference' => $optionFacts['isoAmtPreference'],
                'equitySaleProceeds' => $equitySaleProceeds,
                'equityCapitalGain' => $equityCapitalGain,
                'estimatedRegularTax' => $estimatedRegularTax,
                'estimatedAmt' => $estimatedAmt,
                'totalEstimatedTax' => $totalEstimatedTax,
                'freeCashFlow' => $freeCashFlow,
                'sourceIds' => $yearSources,
            ];

            $lifetime['taxableCompIncome'] = MoneyMath::add($lifetime['taxableCompIncome'], $taxableCompIncome);
            $lifetime['totalTaxableIncome'] = MoneyMath::add($lifetime['totalTaxableIncome'], $totalTaxableIncome);
            $lifetime['nsoOrdinaryIncome'] = MoneyMath::add($lifetime['nsoOrdinaryIncome'], $optionFacts['nsoOrdinaryIncome']);
            $lifetime['isoAmtPreference'] = MoneyMath::add($lifetime['isoAmtPreference'], $optionFacts['isoAmtPreference']);
            $lifetime['equitySaleProceeds'] = MoneyMath::add($lifetime['equitySaleProceeds'], $equitySaleProceeds);
            $lifetime['equityCapitalGain'] = MoneyMath::add($lifetime['equityCapitalGain'], $equityCapitalGain);
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
    private function optionFactsForYear(JobSpec $job, array $vestingRows, int $year, int $startYear, ModelAssumptions $modelAssumptions): array
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
            $bargainElement = $this->bargainElement($job, $row, $year, $year - $startYear, $modelAssumptions);

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
    private function bargainElement(JobSpec $job, array $row, int $year, int $yearOffset, ModelAssumptions $modelAssumptions): float
    {
        $strike = $this->strikeForGrant($job, $row['grantId']);
        $sharePrice = $this->optionExerciseFairMarketValue($job, $year, $yearOffset, $modelAssumptions);
        $marketValue = MoneyMath::multiply($sharePrice, $row['exercisableShares']);
        $exerciseOutlay = MoneyMath::multiply($strike, $row['exercisableShares']);

        return max(0.0, MoneyMath::subtract($marketValue, $exerciseOutlay));
    }

    private function optionExerciseFairMarketValue(JobSpec $job, int $year, int $yearOffset, ModelAssumptions $modelAssumptions): float
    {
        if ($job->isPrivate()) {
            return $this->privateValuationScenarioService->commonFmvForYear($job, $year, 'medium', $modelAssumptions);
        }

        return $this->equityValuationService->sharePrice($job, max(0, $yearOffset), 'medium');
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
            routingReason: 'Career comparison liquid equity proceeds are routed as Schedule D review inputs; projected gain is emitted as a separate source when basis is known.',
            notes: 'Projection records gross proceeds separately from the modeled capital-gain amount.',
        );
    }

    private function equityCapitalGainSource(JobSpec $job, int $year, float $amount): TaxFactSource
    {
        return new TaxFactSource(
            id: $this->sourceId($job, $year, 'equity-capital-gain', TaxFactSourceType::EquityCompLongTermCapitalGain->value),
            label: "{$job->name()} equity long-term capital gain",
            amount: $amount,
            sourceType: TaxFactSourceType::EquityCompLongTermCapitalGain,
            formType: 'career_comparison_projection',
            routing: TaxFactRouting::ScheduleDEquityCapitalGain,
            routingReason: 'Projected private-company liquidity gain is routed through the same Schedule D preferential-capital-gain tax path used by the tax preview.',
            notes: 'Projection treats scenario liquidity-event gain as long-term capital gain based on modeled proceeds minus exercise basis.',
        );
    }

    private function privateRsuOrdinaryIncomeSource(JobSpec $job, int $year, float $amount): TaxFactSource
    {
        return new TaxFactSource(
            id: $this->sourceId($job, $year, 'private-rsu-ordinary-income', TaxFactSourceType::EquityCompRsuOrdinaryIncome->value),
            label: "{$job->name()} private RSU liquidity ordinary income",
            amount: $amount,
            sourceType: TaxFactSourceType::EquityCompRsuOrdinaryIncome,
            formType: 'career_comparison_projection',
            routing: TaxFactRouting::Form1040RsuOrdinaryIncome,
            routingReason: 'Private-company RSU liquidity is treated as ordinary compensation income in the career-comparison projection.',
            notes: 'Projection treats private RSU settlement value as ordinary wage-like income rather than preferential long-term capital gain.',
        );
    }

    private function sourceId(JobSpec $job, int $year, string $subject, string $sourceType): string
    {
        $raw = "{$job->id()}-{$year}-{$subject}-{$sourceType}";
        $normalized = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '-', $raw) ?? $raw);

        return 'cc-'.trim($normalized, '-');
    }
}
