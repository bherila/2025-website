<?php

namespace App\Services\Planning\OpportunityCost;

/**
 * Frozen v1 projection contract:
 * - startYear:int, horizonYears:int, currentJobId:string|null
 * - jobs:list{id:string,name:string,isCurrent:bool,annual:list{year:int,salary:float,bonus:float,vestedLiquidEquity:float,shareSaleProceeds:float,exerciseOutlay:float,freeCashFlow:float},liquidity:{low:list{year:int,cumulativeValue:float},medium:list{year:int,cumulativeValue:float},high:list{year:int,cumulativeValue:float}},vesting:list{grantId:string,type:'rsu'|'iso'|'nso',year:int,vestedShares:float,exercisableShares:float},lifetime:{totalCashComp:float,totalEquityValue:{low:float,medium:float,high:float},totalValue:{low:float,medium:float,high:float}},afterTax?:{annual:list{year:int,taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,sourceIds:list<string>},lifetime:{taxableCompIncome:float,nsoOrdinaryIncome:float,isoAmtPreference:float,equitySaleProceeds:float,estimatedRegularTax:float,estimatedAmt:float,totalEstimatedTax:float,freeCashFlow:float,totalValue:{low:float,medium:float,high:float}}}}
 * - deltasVsCurrent:list{jobId:string,name:string,cashCompDelta:float,totalValueDelta:{low:float,medium:float,high:float}}
 * - warnings:list<string>
 */
final readonly class OpportunityCostProjection
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function __construct(private array $data) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->data;
    }

    /** @return list<array<string, mixed>> */
    public function jobs(): array
    {
        return is_array($this->data['jobs'] ?? null) ? array_values(array_filter($this->data['jobs'], 'is_array')) : [];
    }

    /** @return list<array<string, mixed>> */
    public function deltasVsCurrent(): array
    {
        return is_array($this->data['deltasVsCurrent'] ?? null) ? array_values(array_filter($this->data['deltasVsCurrent'], 'is_array')) : [];
    }

    /** @return list<string> */
    public function warnings(): array
    {
        return is_array($this->data['warnings'] ?? null) ? array_values(array_filter($this->data['warnings'], 'is_string')) : [];
    }

    /** @return list<array<string, mixed>> */
    public function annualForJob(string $jobId): array
    {
        foreach ($this->jobs() as $job) {
            if (($job['id'] ?? null) === $jobId && is_array($job['annual'] ?? null)) {
                return array_values(array_filter($job['annual'], 'is_array'));
            }
        }

        return [];
    }

    /** @return array<string, list<array<string, mixed>>> */
    public function liquidityBandsForJob(string $jobId): array
    {
        foreach ($this->jobs() as $job) {
            if (($job['id'] ?? null) === $jobId && is_array($job['liquidity'] ?? null)) {
                return [
                    'low' => is_array($job['liquidity']['low'] ?? null) ? array_values(array_filter($job['liquidity']['low'], 'is_array')) : [],
                    'medium' => is_array($job['liquidity']['medium'] ?? null) ? array_values(array_filter($job['liquidity']['medium'], 'is_array')) : [],
                    'high' => is_array($job['liquidity']['high'] ?? null) ? array_values(array_filter($job['liquidity']['high'], 'is_array')) : [],
                ];
            }
        }

        return ['low' => [], 'medium' => [], 'high' => []];
    }
}
