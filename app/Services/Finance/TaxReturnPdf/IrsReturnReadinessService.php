<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxReturnPdf\Data\IrsReturnReadinessResult;

class IrsReturnReadinessService
{
    private const array FORM_LABELS = [
        'form-1040' => 'Form 1040',
        'schedule-1' => 'Schedule 1',
        'schedule-3' => 'Schedule 3',
        'schedule-d' => 'Schedule D',
        'form-8949' => 'Form 8949',
    ];

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
     */
    public function forRequest(
        User $user,
        int $year,
        string $scope,
        ?string $formId,
        string $mode,
        ?FinTaxReturnProfile $profile,
        array $facts,
    ): IrsReturnReadinessResult {
        $errors = [];
        $warnings = [];
        $unsupportedForms = $scope === 'return' ? $this->formSelector->unsupportedRequiredForms($facts) : [];
        $requiredForms = $scope === 'return' ? $this->formSelector->requiredForms($facts) : [$formId ?? 'form-1040'];

        if ($scope === 'return') {
            $missingProfileFields = $this->missingProfileFields($profile);

            foreach ($missingProfileFields as $label) {
                $errors[] = "Complete federal return export requires {$label} in the tax return profile.";
            }

            foreach ($unsupportedForms as $unsupportedForm) {
                $errors[] = "Complete federal return export is blocked because {$unsupportedForm} appears required but is not pinned or mapped yet.";
            }
        } else {
            $formLabel = self::FORM_LABELS[$formId ?? 'form-1040'] ?? 'This IRS form';

            foreach ($this->missingProfileFields($profile) as $label) {
                $warnings[] = "{$formLabel} can be generated with {$label} blank, but the user must complete it manually.";
            }
        }

        if ($this->hasUnsupportedForm8949Rows($facts) && $this->requiresForm8949($scope, $formId, $requiredForms)) {
            $errors[] = 'Form 8949 export is blocked because one or more capital-gain rows do not have a supported Form 8949 box.';
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
     * @param  array<int, string>  $requiredForms
     */
    private function requiresForm8949(string $scope, ?string $formId, array $requiredForms): bool
    {
        if ($scope === 'form') {
            return $formId === 'form-8949';
        }

        return in_array('form-8949', $requiredForms, true);
    }
}
