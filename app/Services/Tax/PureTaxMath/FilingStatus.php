<?php

namespace App\Services\Tax\PureTaxMath;

enum FilingStatus: string
{
    case Single = 'single';
    case MarriedFilingJointly = 'married_filing_jointly';
    case HeadOfHousehold = 'head_of_household';
    case QualifyingSurvivingSpouse = 'qualifying_surviving_spouse';

    public static function fromInput(string $value): self
    {
        return match ($value) {
            'mfj', 'married', 'marriedFilingJointly', 'Married Filing Jointly', self::MarriedFilingJointly->value => self::MarriedFilingJointly,
            'hoh', 'headOfHousehold', 'Head of Household', self::HeadOfHousehold->value => self::HeadOfHousehold,
            'qss', 'qualifyingWidow', 'Qualifying Surviving Spouse', self::QualifyingSurvivingSpouse->value => self::QualifyingSurvivingSpouse,
            default => self::Single,
        };
    }

    public function isMarriedLike(): bool
    {
        return in_array($this, [self::MarriedFilingJointly, self::QualifyingSurvivingSpouse], true);
    }

    public function bracketKey(): string
    {
        return match ($this) {
            self::MarriedFilingJointly, self::QualifyingSurvivingSpouse => 'mfj',
            self::HeadOfHousehold => 'hoh',
            self::Single => 'single',
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::Single => 'Single',
            self::MarriedFilingJointly => 'MFJ',
            self::HeadOfHousehold => 'HoH',
            self::QualifyingSurvivingSpouse => 'QSS',
        };
    }

    public function socialSecurityBaseAmount(): float
    {
        return $this->isMarriedLike() ? 32000.0 : 25000.0;
    }

    public function socialSecurityAdjustedBaseAmount(): float
    {
        return $this->isMarriedLike() ? 44000.0 : 34000.0;
    }

    public function niitThreshold(): float
    {
        return $this->isMarriedLike() ? 250000.0 : 200000.0;
    }
}
