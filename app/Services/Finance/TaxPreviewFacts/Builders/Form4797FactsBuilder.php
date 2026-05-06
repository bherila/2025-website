<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Enums\Finance\DeductionCategory;
use App\Models\FinanceTool\UserDeduction;
use App\Services\Finance\TaxPreviewFacts\Data\Form4797Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactRouting;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

class Form4797FactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  UserDeduction[]  $userDeductions
     */
    public function build(array $userDeductions): Form4797Facts
    {
        $partISources = [
            ...$this->manualSources($userDeductions, DeductionCategory::Form4797PartI1231Gain->value, TaxFactSourceType::Form4797PartI1231Gain, TaxFactRouting::Form4797PartILine7, 'Form 4797 Part I line 7 net Section 1231 gain.'),
            ...$this->manualSources($userDeductions, DeductionCategory::Form4797PartI1231Loss->value, TaxFactSourceType::Form4797PartI1231Loss, TaxFactRouting::Form4797PartILine7, 'Form 4797 Part I line 7 net Section 1231 loss.', -1.0),
        ];
        $partIISources = [
            ...$this->manualSources($userDeductions, DeductionCategory::Form4797PartIIOrdinaryGain->value, TaxFactSourceType::Form4797PartIIOrdinaryGain, TaxFactRouting::Form4797PartIILine18b, 'Form 4797 Part II line 18b ordinary gain.'),
            ...$this->manualSources($userDeductions, DeductionCategory::Form4797PartIIOrdinaryLoss->value, TaxFactSourceType::Form4797PartIIOrdinaryLoss, TaxFactRouting::Form4797PartIILine18b, 'Form 4797 Part II line 18b ordinary loss.', -1.0),
        ];
        $partIIISources = $this->manualSources($userDeductions, DeductionCategory::Form4797PartIIIRecapture->value, TaxFactSourceType::Form4797PartIIIRecapture, TaxFactRouting::Form4797PartIIIRecapture, 'Form 4797 Part III depreciation recapture is treated as ordinary income.');

        $partINet1231 = $this->sumSources($partISources);
        $partIIOrdinary = $this->sumSources($partIISources);
        $partIIIRecapture = $this->sumSources($partIIISources);
        $partIRoutedAsOrdinary = $partINet1231 < 0.0 ? $partINet1231 : 0.0;
        $partIRoutedAsCapital = $partINet1231 > 0.0 ? $partINet1231 : 0.0;
        $netToSchedule1Line4 = $this->sumMoney([$partIRoutedAsOrdinary, $partIIOrdinary, $partIIIRecapture]);
        $hasActivity = $partINet1231 !== 0.0 || $partIIOrdinary !== 0.0 || $partIIIRecapture !== 0.0;

        return new Form4797Facts(
            partISources: $partISources,
            partINet1231: $partINet1231,
            partIISources: $partIISources,
            partIIOrdinary: $partIIOrdinary,
            partIIISources: $partIIISources,
            partIIIRecapture: $partIIIRecapture,
            netToSchedule1Line4: $netToSchedule1Line4,
            netToScheduleDLongTerm: $partIRoutedAsCapital,
            hasActivity: $hasActivity,
            schedule1Sources: $netToSchedule1Line4 !== 0.0 ? [$this->schedule1Source($netToSchedule1Line4, $partIRoutedAsOrdinary, $partIIOrdinary, $partIIIRecapture)] : [],
            scheduleDSources: $partIRoutedAsCapital !== 0.0 ? [$this->scheduleDSource($partIRoutedAsCapital)] : [],
        );
    }

    /**
     * @param  UserDeduction[]  $userDeductions
     * @return TaxFactSource[]
     */
    private function manualSources(array $userDeductions, string $category, TaxFactSourceType $sourceType, TaxFactRouting $routing, string $routingReason, float $sign = 1.0): array
    {
        $sources = [];

        foreach ($userDeductions as $deduction) {
            if ($deduction->category !== $category || (float) $deduction->amount === 0.0) {
                continue;
            }

            $sources[] = new TaxFactSource(
                id: "user-deduction-{$deduction->id}-form-4797",
                label: $deduction->description ?: $this->defaultLabel($category),
                amount: $this->roundMoney((float) $deduction->amount * $sign),
                sourceType: $sourceType,
                routing: $routing,
                routingReason: $routingReason,
                isReviewed: true,
            );
        }

        return $sources;
    }

    private function schedule1Source(float $amount, float $partIOrdinary, float $partIIOrdinary, float $partIIIRecapture): TaxFactSource
    {
        return new TaxFactSource(
            id: 'form-4797-schedule-1-line-4',
            label: 'Form 4797 ordinary gain or loss',
            amount: $amount,
            sourceType: TaxFactSourceType::Form4797PartIIOrdinaryGain,
            routing: TaxFactRouting::Schedule1Line4,
            routingReason: 'Form 4797 ordinary amounts flow to Schedule 1 line 4. A net Section 1231 loss from Part I is ordinary; a net Section 1231 gain flows to Schedule D instead.',
            notes: "Part I ordinary {$partIOrdinary}; Part II {$partIIOrdinary}; Part III recapture {$partIIIRecapture}.",
            isReviewed: true,
        );
    }

    private function scheduleDSource(float $amount): TaxFactSource
    {
        return new TaxFactSource(
            id: 'form-4797-schedule-d-line-12',
            label: 'Form 4797 net Section 1231 gain',
            amount: $amount,
            sourceType: TaxFactSourceType::Form4797PartI1231Gain,
            routing: TaxFactRouting::ScheduleDLine12,
            routingReason: 'A positive Form 4797 Part I net Section 1231 gain flows to Schedule D as long-term capital gain.',
            isReviewed: true,
        );
    }

    private function defaultLabel(string $category): string
    {
        return match ($category) {
            DeductionCategory::Form4797PartI1231Gain->value => 'Form 4797 Part I Section 1231 gain',
            DeductionCategory::Form4797PartI1231Loss->value => 'Form 4797 Part I Section 1231 loss',
            DeductionCategory::Form4797PartIIOrdinaryGain->value => 'Form 4797 Part II ordinary gain',
            DeductionCategory::Form4797PartIIOrdinaryLoss->value => 'Form 4797 Part II ordinary loss',
            DeductionCategory::Form4797PartIIIRecapture->value => 'Form 4797 Part III recapture',
            default => 'Form 4797 manual entry',
        };
    }
}
