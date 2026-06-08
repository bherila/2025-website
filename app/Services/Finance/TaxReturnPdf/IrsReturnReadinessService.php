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

        if ($scope === 'form' && $formId !== 'form-1040') {
            $errors[] = 'Only Form 1040 is pinned and mapped for this MVP.';
        }

        if ($scope === 'return') {
            $missingProfileFields = $this->missingProfileFields($profile);

            foreach ($missingProfileFields as $label) {
                $errors[] = "Complete federal return export requires {$label} in the tax return profile.";
            }

            foreach ($unsupportedForms as $unsupportedForm) {
                $errors[] = "Complete federal return export is blocked because {$unsupportedForm} appears required but is not pinned or mapped yet.";
            }
        } else {
            foreach ($this->missingProfileFields($profile) as $label) {
                $warnings[] = "Form 1040 can be generated with {$label} blank, but the user must complete it manually.";
            }
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
}
