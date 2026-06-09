<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxReturnPdf\Data\IrsReturnReadinessResult;

class IrsReturnReadinessService
{
    private const array BASE_REQUIRED_PROFILE_FIELDS = [
        'filing_status' => 'filing status',
        'taxpayer_first_name' => 'taxpayer first name',
        'taxpayer_last_name' => 'taxpayer last name',
        'taxpayer_ssn' => 'taxpayer SSN',
        'address_line1' => 'street address',
        'city' => 'city',
        'state' => 'state',
        'postal_code' => 'ZIP/postal code',
        'digital_assets_answer' => 'digital assets answer',
    ];

    public function __construct(
        private readonly IrsAcroFormFillEngine $fillEngine,
        private readonly IrsReturnFormSelector $formSelector,
    ) {}

    /**
     * @param  array<string, mixed>  $facts
     * @param  array<int, string>  $selectedFormIds
     */
    public function forRequest(
        User $user,
        int $year,
        string $scope,
        ?string $formId,
        string $mode,
        ?FinTaxReturnProfile $profile,
        array $facts,
        array $selectedFormIds = [],
    ): IrsReturnReadinessResult {
        $errors = [];
        $warnings = [];
        $unsupportedForms = $scope === 'return' ? $this->formSelector->unsupportedRequiredForms($facts) : [];
        $requiredForms = $scope === 'return' ? $this->formSelector->requiredForms($facts) : $this->requestedForms($scope, $formId, $selectedFormIds);

        if ($requiredForms === []) {
            $errors[] = 'Select at least one supported IRS PDF form to export.';
        }

        foreach ($this->missingProfileFields($profile) as $label) {
            $warnings[] = "Taxpayer identity field {$label} is not included by default and may be blank in the generated PDF.";
        }

        foreach ($unsupportedForms as $unsupportedForm) {
            $warnings[] = "{$unsupportedForm} appears required from Tax Preview facts but no pinned or mapped PDF exists yet, so it was omitted from this supported packet.";
        }

        if ($this->hasUnsupportedForm8949Rows($facts) && $this->requiresForm8949($scope, $formId, $requiredForms)) {
            $warnings[] = 'One or more capital-gain rows do not have a supported Form 8949 box and were omitted from the Form 8949 PDF detail.';
        }

        if ($this->missingRequiredForm8949Rows($facts) && $this->requiresForm8949($scope, $formId, $requiredForms)) {
            $warnings[] = 'Form 8949 was selected or appears required, but no supported Form 8949 detail rows are available; a blank Form 8949 may be generated for manual completion.';
        }

        if ($this->hasUnsupportedSchedule3Line6Details($facts) && $this->requiresSchedule3($scope, $formId, $requiredForms)) {
            $warnings[] = 'Schedule 3 line 6 details cannot be fully itemized from the current facts; review line 6 manually in the generated PDF.';
        }

        if ($mode === 'editable' && ! $this->fillEngine->supportsEditableOutput()) {
            $errors[] = UnavailableAcroFormFillEngine::REASON;
        }

        return new IrsReturnReadinessResult(
            errors: array_values(array_unique($errors)),
            warnings: array_values(array_unique($warnings)),
            requiredForms: array_values(array_filter($requiredForms)),
            unsupportedForms: $unsupportedForms,
        );
    }

    /**
     * @param  array<int, string>  $selectedFormIds
     * @return array<int, string>
     */
    private function requestedForms(string $scope, ?string $formId, array $selectedFormIds): array
    {
        if ($scope === 'selection') {
            return array_values(array_filter($selectedFormIds));
        }

        return [$formId ?? 'form-1040'];
    }

    /**
     * @return array<int, string>
     */
    private function missingProfileFields(?FinTaxReturnProfile $profile): array
    {
        if (! $profile instanceof FinTaxReturnProfile) {
            return array_values(self::BASE_REQUIRED_PROFILE_FIELDS);
        }

        $required = self::BASE_REQUIRED_PROFILE_FIELDS;
        if ($profile->filing_status === 'married_filing_jointly') {
            $required['spouse_first_name'] = 'spouse first name';
            $required['spouse_last_name'] = 'spouse last name';
            $required['spouse_ssn'] = 'spouse SSN';
        }

        $missing = [];

        foreach ($required as $field => $label) {
            $value = $profile->getAttribute($field);
            if ($value === null || trim((string) $value) === '') {
                $missing[] = $label;
            }
        }

        return $missing;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function hasUnsupportedForm8949Rows(array $facts): bool
    {
        $count = $facts['irsPdf']['form8949']['unsupportedRowCount'] ?? 0;

        return is_numeric($count) && (int) $count > 0;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function missingRequiredForm8949Rows(array $facts): bool
    {
        $instances = $facts['irsPdf']['form8949']['instances'] ?? null;

        return is_array($instances) && $instances === [];
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function hasUnsupportedSchedule3Line6Details(array $facts): bool
    {
        $schedule3 = is_array($facts['schedule3'] ?? null) ? $facts['schedule3'] : [];
        $line7 = $this->numeric($schedule3['line7OtherNonrefundableCredits'] ?? 0.0);

        if (! $this->nonZero($line7)) {
            return false;
        }

        $sources = is_array($schedule3['line6Sources'] ?? null) ? $schedule3['line6Sources'] : [];
        if ($sources === []) {
            return true;
        }

        $supportedTotal = 0.0;

        foreach ($sources as $source) {
            if (! is_array($source)) {
                return true;
            }

            $amount = $this->numeric($source['amount'] ?? 0.0);
            if (! $this->nonZero($amount)) {
                continue;
            }

            $box = is_scalar($source['box'] ?? null) ? strtolower(trim((string) $source['box'])) : null;
            if (! in_array($box, ['6a', '6b', '6z'], true)) {
                return true;
            }

            $supportedTotal += $amount;
        }

        return abs($supportedTotal - $line7) > 0.004;
    }

    /**
     * @param  array<int, string>  $requiredForms
     */
    private function requiresForm8949(string $scope, ?string $formId, array $requiredForms): bool
    {
        if ($scope === 'form') {
            return $formId === 'form-8949';
        }

        return in_array('form-8949', $requiredForms, true);
    }

    /**
     * @param  array<int, string>  $requiredForms
     */
    private function requiresSchedule3(string $scope, ?string $formId, array $requiredForms): bool
    {
        if ($scope === 'form') {
            return $formId === 'schedule-3';
        }

        return in_array('schedule-3', $requiredForms, true);
    }

    private function nonZero(mixed $value): bool
    {
        return is_numeric($value) && abs((float) $value) > 0.004;
    }

    private function numeric(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }
}
