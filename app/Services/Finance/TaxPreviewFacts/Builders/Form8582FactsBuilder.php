<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\PalCarryforward;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\Form8582ActivityFact;
use App\Services\Finance\TaxPreviewFacts\Data\Form8582Facts;

class Form8582FactsBuilder extends TaxPreviewFactBuilder
{
    private const float RENTAL_SPECIAL_ALLOWANCE = 25000.0;

    private const float RENTAL_PHASEOUT_START = 100000.0;

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  PalCarryforward[]  $palCarryforwards
     */
    public function build(array $k1Docs, array $palCarryforwards, float $magi, bool $isMarried, bool $realEstateProfessional = false): Form8582Facts
    {
        $inputs = $this->activityInputs($k1Docs, $palCarryforwards);
        if ($realEstateProfessional) {
            $inputs = array_values(array_filter(
                $inputs,
                static fn (array $activity): bool => ! $activity['isRentalRealEstate'] || ! $activity['activeParticipation'],
            ));
        }

        $lines = array_map(function (array $activity): array {
            return [
                ...$activity,
                'overallGainOrLoss' => $this->sumMoney([$activity['currentIncome'], $activity['currentLoss'], $activity['priorYearUnallowed']]),
                'allowedLossThisYear' => 0.0,
                'suspendedLossCarryforward' => 0.0,
            ];
        }, $inputs);

        $totalPassiveIncome = $this->sumMoney(array_map(static fn (array $activity): float => $activity['currentIncome'], $lines));
        $totalPassiveLoss = $this->sumMoney(array_map(static fn (array $activity): float => $activity['currentLoss'], $lines));
        $totalPriorYearUnallowed = $this->sumMoney(array_map(static fn (array $activity): float => $activity['priorYearUnallowed'], $lines));
        $netPassiveResult = $this->sumMoney([$totalPassiveIncome, $totalPassiveLoss, $totalPriorYearUnallowed]);

        if ($netPassiveResult >= 0.0) {
            $totalGrossLoss = $this->sumMoney([abs($totalPassiveLoss), abs($totalPriorYearUnallowed)]);
            $lines = $this->allocateAllowedLosses($lines, $totalGrossLoss);

            return $this->facts($lines, $totalPassiveIncome, $totalPassiveLoss, $totalPriorYearUnallowed, $netPassiveResult, 0.0, $totalGrossLoss, 0.0, 0.0, false, $magi, $isMarried, $realEstateProfessional);
        }

        $grossLoss = $this->sumMoney([abs($totalPassiveLoss), abs($totalPriorYearUnallowed)]);
        $rentalActivities = array_values(array_filter($lines, static fn (array $activity): bool => $activity['isRentalRealEstate'] && $activity['activeParticipation']));
        $rentalLossAmount = $this->sumMoney(array_map(
            static fn (array $activity): float => abs($activity['currentLoss']) + abs($activity['priorYearUnallowed']),
            $rentalActivities,
        ));
        $rentalIncomeAmount = $this->sumMoney(array_map(static fn (array $activity): float => $activity['currentIncome'], $rentalActivities));
        $netRentalLoss = max(0.0, $this->subtractMoney($rentalLossAmount, $rentalIncomeAmount));
        $phaseOutReduction = max(0.0, MoneyMath::round(($magi - self::RENTAL_PHASEOUT_START) * 0.5));
        $rentalAllowance = max(0.0, $this->subtractMoney(self::RENTAL_SPECIAL_ALLOWANCE, $phaseOutReduction));
        $effectiveAllowance = min($rentalAllowance, $netRentalLoss, $grossLoss);
        $totalAllowedLoss = $this->sumMoney([$totalPassiveIncome, $effectiveAllowance]);
        $totalSuspendedLoss = max(0.0, $this->subtractMoney($grossLoss, $totalAllowedLoss));
        $lines = $this->allocateAllowedLosses($lines, $totalAllowedLoss);

        return $this->facts($lines, $totalPassiveIncome, $totalPassiveLoss, $totalPriorYearUnallowed, $netPassiveResult, $effectiveAllowance, $totalAllowedLoss, $totalSuspendedLoss, $totalAllowedLoss, $totalSuspendedLoss > 0.0, $magi, $isMarried, $realEstateProfessional);
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  PalCarryforward[]  $palCarryforwards
     * @return array<int, array{activityName:string,ein:?string,isRentalRealEstate:bool,activeParticipation:bool,currentIncome:float,currentLoss:float,priorYearUnallowed:float}>
     */
    private function activityInputs(array $k1Docs, array $palCarryforwards): array
    {
        $activities = [];

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $baseName = $this->k1PartnerName($doc, $data);
            $ein = $this->fieldString($data, 'A');
            $isLimitedPartner = $this->isLimitedPartner($data);
            $classification = $this->activityClassification($data);
            $box1 = $this->k1Field($data, '1');
            $box2 = $this->k1Field($data, '2');
            $box3 = $this->k1Field($data, '3');

            if ($box1 !== 0.0 && $classification !== 'nonpassive') {
                $name = "{$baseName} (ordinary business)";
                $activities[] = $this->activityInput($name, $ein, false, ! $isLimitedPartner, $box1, $palCarryforwards);
            }

            if ($box2 !== 0.0) {
                $activities[] = $this->activityInput($baseName, $ein, true, ! $isLimitedPartner, $box2, $palCarryforwards);
            }

            if ($box3 !== 0.0) {
                $name = "{$baseName} (other rental)";
                $activities[] = $this->activityInput($name, $ein, false, ! $isLimitedPartner, $box3, $palCarryforwards);
            }

            foreach (($data['passiveActivities'] ?? []) as $passiveActivity) {
                if (! is_array($passiveActivity)) {
                    continue;
                }

                $name = is_string($passiveActivity['name'] ?? null) && trim($passiveActivity['name']) !== ''
                    ? "{$baseName} — {$passiveActivity['name']}"
                    : "{$baseName} — passive activity";
                $amount = $this->sumMoney([
                    $this->parseMoney($passiveActivity['currentIncome'] ?? null) ?? 0.0,
                    $this->parseMoney($passiveActivity['currentLoss'] ?? null) ?? 0.0,
                ]);
                $activities[] = $this->activityInput($name, $ein, false, false, $amount, $palCarryforwards);
            }
        }

        return $activities;
    }

    /**
     * @param  PalCarryforward[]  $palCarryforwards
     * @return array{activityName:string,ein:?string,isRentalRealEstate:bool,activeParticipation:bool,currentIncome:float,currentLoss:float,priorYearUnallowed:float}
     */
    private function activityInput(string $name, ?string $ein, bool $isRentalRealEstate, bool $activeParticipation, float $amount, array $palCarryforwards): array
    {
        return [
            'activityName' => $name,
            'ein' => $ein,
            'isRentalRealEstate' => $isRentalRealEstate,
            'activeParticipation' => $activeParticipation,
            'currentIncome' => max(0.0, $amount),
            'currentLoss' => min(0.0, $amount),
            'priorYearUnallowed' => $this->findCarryforward($palCarryforwards, $name, $ein),
        ];
    }

    /**
     * @param  PalCarryforward[]  $palCarryforwards
     */
    private function findCarryforward(array $palCarryforwards, string $activityName, ?string $ein): float
    {
        foreach ($palCarryforwards as $carryforward) {
            if ($carryforward->activity_name === $activityName) {
                return (float) $carryforward->ordinary_carryover;
            }
        }

        if ($ein === null) {
            return 0.0;
        }

        $einMatches = array_values(array_filter(
            $palCarryforwards,
            static fn (PalCarryforward $carryforward): bool => $carryforward->activity_ein === $ein,
        ));

        return count($einMatches) === 1 ? (float) $einMatches[0]->ordinary_carryover : 0.0;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     * @return array<int, array<string, mixed>>
     */
    private function allocateAllowedLosses(array $lines, float $totalAllowed): array
    {
        $lossIndexes = array_keys(array_filter(
            $lines,
            fn (array $activity): bool => $this->sumMoney([$activity['currentLoss'], $activity['priorYearUnallowed']]) < 0.0,
        ));
        $totalWeight = $this->sumMoney(array_map(
            fn (int $index): float => abs($this->sumMoney([$lines[$index]['currentLoss'], $lines[$index]['priorYearUnallowed']])),
            $lossIndexes,
        ));

        if ($totalWeight === 0.0) {
            return $lines;
        }

        $allocatedSoFar = 0.0;
        $lastPosition = count($lossIndexes) - 1;
        foreach ($lossIndexes as $position => $index) {
            $weight = abs($this->sumMoney([$lines[$index]['currentLoss'], $lines[$index]['priorYearUnallowed']]));
            $allowed = $position === $lastPosition
                ? $this->subtractMoney($totalAllowed, $allocatedSoFar)
                : MoneyMath::round($totalAllowed * $weight / $totalWeight);
            $lines[$index]['allowedLossThisYear'] = $allowed;
            $lines[$index]['suspendedLossCarryforward'] = max(0.0, $this->subtractMoney($weight, $allowed));
            $allocatedSoFar = $this->sumMoney([$allocatedSoFar, $allowed]);
        }

        return $lines;
    }

    /**
     * @param  array<int, array<string, mixed>>  $lines
     */
    private function facts(array $lines, float $totalPassiveIncome, float $totalPassiveLoss, float $totalPriorYearUnallowed, float $netPassiveResult, float $rentalAllowance, float $totalAllowedLoss, float $totalSuspendedLoss, float $netDeductionToReturn, bool $isLossLimited, float $magi, bool $isMarried, bool $realEstateProfessional): Form8582Facts
    {
        return new Form8582Facts(
            activities: array_map(static fn (array $activity): Form8582ActivityFact => new Form8582ActivityFact(
                activityName: $activity['activityName'],
                ein: $activity['ein'],
                isRentalRealEstate: $activity['isRentalRealEstate'],
                activeParticipation: $activity['activeParticipation'],
                currentIncome: $activity['currentIncome'],
                currentLoss: $activity['currentLoss'],
                priorYearUnallowed: $activity['priorYearUnallowed'],
                overallGainOrLoss: $activity['overallGainOrLoss'],
                allowedLossThisYear: $activity['allowedLossThisYear'],
                suspendedLossCarryforward: $activity['suspendedLossCarryforward'],
            ), $lines),
            totalPassiveIncome: $totalPassiveIncome,
            totalPassiveLoss: $totalPassiveLoss,
            totalPriorYearUnallowed: $totalPriorYearUnallowed,
            netPassiveResult: $netPassiveResult,
            rentalAllowance: $rentalAllowance,
            totalAllowedLoss: $totalAllowedLoss,
            totalSuspendedLoss: $totalSuspendedLoss,
            netDeductionToReturn: $netDeductionToReturn,
            isLossLimited: $isLossLimited,
            magi: $magi,
            isMarried: $isMarried,
            realEstateProfessional: $realEstateProfessional,
        );
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function fieldString(array $data, string $field): ?string
    {
        $value = $data['fields'][$field]['value'] ?? null;

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function isLimitedPartner(array $data): bool
    {
        $g2 = strtolower($this->fieldString($data, 'G2') ?? '');
        $partnerType = strtolower($this->fieldString($data, 'G') ?? $this->fieldString($data, 'G_partnerType') ?? '');

        return in_array($g2, ['true', 'x', 'yes'], true) || str_contains($partnerType, 'limited') || str_contains($partnerType, ' lp');
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function activityClassification(array $data): string
    {
        if (($this->fieldString($data, 'partnershipPosition_traderInSecurities') ?? '') === 'true') {
            return 'nonpassive';
        }

        $partnerType = strtolower($this->fieldString($data, 'G') ?? $this->fieldString($data, 'G_partnerType') ?? '');
        if (str_contains($partnerType, 'general') || str_contains($partnerType, ' gp')) {
            return 'nonpassive';
        }

        if (str_contains($partnerType, 'limited') || str_contains($partnerType, ' lp')) {
            return 'passive';
        }

        return 'unknown';
    }
}
