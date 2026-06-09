<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Models\User;
use App\Services\Finance\TaxPreviewFactsService;
use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfBuildResult;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\Exceptions\TaxReturnPdfUnavailableException;

class IrsReturnPdfBuilder
{
    private const int FORM_8949_ROWS_PER_PAGE = 11;

    public function __construct(
        private readonly TaxPreviewFactsService $taxPreviewFactsService,
        private readonly IrsPdfTemplateRepository $templates,
        private readonly IrsFieldDumpService $fieldDumpService,
        private readonly IrsFieldMapRepository $fieldMaps,
        private readonly IrsFieldValueResolver $valueResolver,
        private readonly IrsFieldValueFormatter $valueFormatter,
        private readonly IrsReturnReadinessService $readinessService,
        private readonly IrsAcroFormFillEngine $fillEngine,
    ) {}

    public function buildForUser(User $user, TaxReturnPdfOptions $options): string
    {
        return $this->buildResultForUser($user, $options)->content;
    }

    public function buildResultForUser(User $user, TaxReturnPdfOptions $options): TaxReturnPdfBuildResult
    {
        $facts = $this->withIrsPdfFacts($this->taxPreviewFactsService->arrayForYear((int) $user->id, $options->year));
        $profile = $this->profile($user, $options->year);
        $readiness = $this->readinessService->forRequest(
            $user,
            $options->year,
            $options->scope,
            $options->formId,
            $options->mode,
            $profile,
            $facts,
            $options->formIds(),
        );

        if (! $readiness->isReady()) {
            throw new TaxReturnPdfUnavailableException($readiness->errors, $readiness->warnings);
        }

        $warnings = $readiness->warnings;
        $formIds = $this->selectedFormIds($options, $readiness->requiredForms, $facts);
        $profileForFields = $options->includeProfilePii ? $profile : null;

        if ($formIds === []) {
            throw new TaxReturnPdfUnavailableException(['Select at least one supported IRS PDF form to export.'], $warnings);
        }

        if (in_array('form-8949', $formIds, true) && $this->form8949Instances($facts) === []) {
            $warnings[] = 'Form 8949 has no supported detail rows, so a blank Form 8949 was generated for manual completion.';
        }

        $content = $this->fillEngine->fillForms($this->formFillJobs($formIds, $options, $facts, $profileForFields), $options);

        return new TaxReturnPdfBuildResult($content, array_values(array_filter($formIds)), array_values(array_unique($warnings)));
    }

    /**
     * @param  array<int, string>  $requiredForms
     * @param  array<string, mixed>  $facts
     * @return array<int, string>
     */
    private function selectedFormIds(TaxReturnPdfOptions $options, array $requiredForms, array $facts): array
    {
        if ($options->scope === 'form') {
            return TaxReturnPdfOptions::normalizeFormIds([$options->formId ?? 'form-1040']);
        }

        if ($options->scope === 'selection') {
            return TaxReturnPdfOptions::normalizeFormIds($options->formIds);
        }

        $recommended = TaxReturnPdfOptions::normalizeFormIds($requiredForms);

        if ($this->form8949Instances($facts) === []) {
            $recommended = array_values(array_filter(
                $recommended,
                static fn (string $formId): bool => $formId !== 'form-8949',
            ));
        }

        return $recommended === [] ? ['form-1040'] : $recommended;
    }

    /**
     * @param  array<int, string>  $formIds
     * @param  array<string, mixed>  $facts
     * @return array<int, array{formId: string, templatePath: string, fieldValues: array<string, string|bool|null>, instanceKey: string}>
     */
    private function formFillJobs(array $formIds, TaxReturnPdfOptions $options, array $facts, ?FinTaxReturnProfile $profile): array
    {
        $jobs = [];

        foreach ($formIds as $index => $formId) {
            if ($formId === 'form-8949') {
                $instances = $this->form8949Instances($facts);

                if ($instances === []) {
                    $jobs[] = $this->formFillJob($formId, "{$options->scope}-{$index}-blank", $options, $this->withBlankForm8949Current($facts), $profile);

                    continue;
                }

                foreach ($instances as $instanceIndex => $instance) {
                    $instanceFacts = $facts;
                    $instanceFacts['irsPdf']['form8949']['current'] = $instance;
                    $jobs[] = $this->formFillJob($formId, "{$options->scope}-{$index}-{$instanceIndex}", $options, $instanceFacts, $profile);
                }

                continue;
            }

            $jobs[] = $this->formFillJob($formId, "{$options->scope}-{$index}", $options, $facts, $profile);
        }

        return $jobs;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{formId: string, templatePath: string, fieldValues: array<string, string|bool|null>, instanceKey: string}
     */
    private function formFillJob(string $formId, string $instanceKey, TaxReturnPdfOptions $options, array $facts, ?FinTaxReturnProfile $profile): array
    {
        $template = $this->templates->template($options->year, $formId);
        $fieldMap = $this->fieldMaps->map($options->year, $formId);
        $fields = $this->indexedFields($this->fieldDumpService->dump($this->templates->templatePath($template)));
        $fieldValues = $this->fieldValues($fieldMap->mappings, $fields, $facts, $profile);

        return [
            'formId' => $formId,
            'templatePath' => $this->templates->templatePath($template),
            'fieldValues' => $fieldValues,
            'instanceKey' => $instanceKey,
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $mappings
     * @param  array<string, IrsFieldDefinition>  $fields
     * @param  array<string, mixed>  $facts
     * @return array<string, string|bool|null>
     */
    public function fieldValues(array $mappings, array $fields, array $facts, ?FinTaxReturnProfile $profile): array
    {
        $values = [];
        $context = [
            'facts' => $facts,
            'profile' => $profile,
            'irsProfile' => $this->profileContext($profile),
        ];

        foreach ($mappings as $mapping) {
            $pdfField = $mapping['pdfField'] ?? null;
            $source = $mapping['source'] ?? null;

            if (! is_string($pdfField) || ! is_string($source)) {
                continue;
            }

            $value = $this->valueResolver->resolve($source, $context);
            $formattedValue = $this->valueFormatter->format($value, $mapping, $fields[$pdfField] ?? null);

            if ($this->isUncheckedCheckboxValue($mapping, $formattedValue)) {
                continue;
            }

            $values[$pdfField] = $formattedValue;
        }

        return $values;
    }

    /**
     * @param  array<string, mixed>  $mapping
     */
    private function isUncheckedCheckboxValue(array $mapping, string|bool|null $value): bool
    {
        return ($mapping['format'] ?? null) === 'checkbox' && $value === false;
    }

    private function profile(User $user, int $year): ?FinTaxReturnProfile
    {
        return FinTaxReturnProfile::query()
            ->where('user_id', $user->id)
            ->where('tax_year', $year)
            ->first();
    }

    /**
     * @return array{nameLine: string|null, ssn: string|null}
     */
    private function profileContext(?FinTaxReturnProfile $profile): array
    {
        if (! $profile instanceof FinTaxReturnProfile) {
            return ['nameLine' => null, 'ssn' => null];
        }

        $taxpayerName = trim(implode(' ', array_filter([
            $profile->taxpayer_first_name,
            $profile->taxpayer_last_name,
        ], static fn (mixed $value): bool => is_scalar($value) && trim((string) $value) !== '')));
        $spouseName = trim(implode(' ', array_filter([
            $profile->spouse_first_name,
            $profile->spouse_last_name,
        ], static fn (mixed $value): bool => is_scalar($value) && trim((string) $value) !== '')));

        $nameParts = array_values(array_filter([$taxpayerName, $spouseName], static fn (string $name): bool => $name !== ''));

        return [
            'nameLine' => $nameParts === [] ? null : implode(' & ', $nameParts),
            'ssn' => is_scalar($profile->taxpayer_ssn) ? (string) $profile->taxpayer_ssn : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<string, mixed>
     */
    private function withIrsPdfFacts(array $facts): array
    {
        [$line18, $line19] = $this->scheduleDPartIIILines18And19($facts);

        $facts['irsPdf'] = [
            'scheduleD' => [
                'lines' => $this->scheduleDLineColumns($facts),
                'line18TwentyEightPercentGain' => $line18,
                'line19UnrecapturedSection1250Gain' => $line19,
                'line21LossOnly' => $this->scheduleDLine21LossOnly($facts),
            ],
            'schedule3' => [
                'line6' => $this->schedule3Line6Details($facts),
            ],
            'form8949' => [
                'instances' => $this->form8949InstancesFromFacts($facts),
                'unsupportedRowCount' => $this->form8949UnsupportedRowCount($facts),
            ],
        ];

        return $facts;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int|string, array{totalProceeds: float, totalCostBasis: float, totalAdjustment: float, netGainOrLoss: float}>
     */
    private function scheduleDLineColumns(array $facts): array
    {
        $lines = [];

        foreach (['1a', '1b', '2', '3', '8a', '8b', '9', '10'] as $line) {
            $lines[$line] = [
                'totalProceeds' => 0.0,
                'totalCostBasis' => 0.0,
                'totalAdjustment' => 0.0,
                'netGainOrLoss' => 0.0,
            ];
        }

        $scheduleD = is_array($facts['scheduleD'] ?? null) ? $facts['scheduleD'] : [];
        $rollups = is_array($scheduleD['form8949Rollups'] ?? null) ? $scheduleD['form8949Rollups'] : [];

        foreach ($rollups as $rollup) {
            if (! is_array($rollup)) {
                continue;
            }

            $line = is_scalar($rollup['scheduleDLine'] ?? null) ? (string) $rollup['scheduleDLine'] : null;
            if ($line === null || ! array_key_exists($line, $lines)) {
                continue;
            }

            $lines[$line]['totalProceeds'] += $this->numeric($rollup['totalProceeds'] ?? 0.0);
            $lines[$line]['totalCostBasis'] += $this->numeric($rollup['totalCostBasis'] ?? 0.0);
            $lines[$line]['totalAdjustment'] += $this->numeric($rollup['totalAdjustment'] ?? 0.0);
            $lines[$line]['netGainOrLoss'] += $this->numeric($rollup['netGainOrLoss'] ?? 0.0);
        }

        foreach ([
            '1a' => 'line1aGainLoss',
            '1b' => 'line1bGainLoss',
            '2' => 'line2GainLoss',
            '3' => 'line3GainLoss',
            '8a' => 'line8aGainLoss',
            '8b' => 'line8bGainLoss',
            '9' => 'line9GainLoss',
            '10' => 'line10GainLoss',
        ] as $line => $key) {
            if (array_key_exists($key, $scheduleD)) {
                $lines[$line]['netGainOrLoss'] = $this->numeric($scheduleD[$key]);
            }
        }

        return $lines;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function scheduleDLine21LossOnly(array $facts): float
    {
        $scheduleD = is_array($facts['scheduleD'] ?? null) ? $facts['scheduleD'] : [];

        if ($this->numeric($scheduleD['line16Combined'] ?? 0.0) >= -0.004) {
            return 0.0;
        }

        return $this->numeric($scheduleD['line21LimitedLossOrGain'] ?? 0.0);
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function scheduleDLine12SourceTotal(array $facts, string $sourceType): float
    {
        $scheduleD = is_array($facts['scheduleD'] ?? null) ? $facts['scheduleD'] : [];
        $sources = is_array($scheduleD['line12Sources'] ?? null) ? $scheduleD['line12Sources'] : [];
        $total = 0.0;

        foreach ($sources as $source) {
            if (! is_array($source) || ($source['sourceType'] ?? null) !== $sourceType) {
                continue;
            }

            $total += $this->numeric($source['amount'] ?? 0.0);
        }

        return $total;
    }

    /**
     * Compute Schedule D Part III lines 18 (28%-rate gain) and 19 (unrecaptured §1250 gain)
     * as a pair, ensuring their sum never exceeds the shared ceiling min(line15, line16).
     *
     * When the combined source totals exceed the shared ceiling the ceiling is apportioned
     * proportionally: line18 = round(ceiling × source18 / combined), then
     * line19 = min(round(ceiling × source19 / combined), ceiling − line18). Computing
     * line19 as the residual prevents independent rounding from pushing the sum above the
     * ceiling (e.g., two equal sources against an odd ceiling both rounding up). Each result
     * is additionally capped at its own source total so apportionment can never inflate a
     * bucket above what was actually reported.
     *
     * @param  array<string, mixed>  $facts
     * @return array{0: float, 1: float} [line18, line19]
     */
    private function scheduleDPartIIILines18And19(array $facts): array
    {
        $source18 = $this->scheduleDLine12SourceTotal($facts, 'k1_collectibles_gain');
        $source19 = $this->scheduleDLine12SourceTotal($facts, 'k1_unrecaptured_1250_gain');

        if ($source18 <= 0.004 && $source19 <= 0.004) {
            return [0.0, 0.0];
        }

        $scheduleD = is_array($facts['scheduleD'] ?? null) ? $facts['scheduleD'] : [];
        $line16 = $this->numeric($scheduleD['line16Combined'] ?? 0.0);
        $line15 = $this->numeric($scheduleD['line15NetLongTerm'] ?? $line16);

        if ($line15 <= 0.004 || $line16 <= 0.004) {
            return [0.0, 0.0];
        }

        $ceiling = min($line15, $line16);
        $combined = $source18 + $source19;

        if ($combined <= $ceiling + 0.004) {
            // Combined totals are within the shared ceiling — each bucket is bounded only by its source.
            return [
                $source18 > 0.004 ? (float) (int) round(min($source18, $ceiling)) : 0.0,
                $source19 > 0.004 ? (float) (int) round(min($source19, $ceiling)) : 0.0,
            ];
        }

        // Proportionally apportion the ceiling across both buckets so that
        // line18 + line19 <= ceiling.  Each bucket is also capped at its own
        // source total to prevent the apportionment from inflating a bucket
        // above what was actually reported.
        //
        // line18 is rounded first; line19 takes the remaining headroom so that
        // independent rounding can never push line18 + line19 above the ceiling
        // (e.g., two equal sources against an odd ceiling both rounding up).
        $line18 = (float) (int) round(min($source18, $ceiling * $source18 / $combined));
        $line19 = (float) min(
            (int) round(min($source19, $ceiling * $source19 / $combined)),
            (int) ($ceiling - $line18),
        );

        return [$line18, $line19];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array{generalBusinessCredit: float, priorYearMinimumTaxCredit: float, otherNonrefundableCredits: float, otherNonrefundableCreditsDescription: string|null}
     */
    private function schedule3Line6Details(array $facts): array
    {
        $schedule3 = is_array($facts['schedule3'] ?? null) ? $facts['schedule3'] : [];
        $sources = is_array($schedule3['line6Sources'] ?? null) ? $schedule3['line6Sources'] : [];
        $details = [
            'generalBusinessCredit' => 0.0,
            'priorYearMinimumTaxCredit' => 0.0,
            'otherNonrefundableCredits' => 0.0,
            'otherNonrefundableCreditsDescription' => null,
        ];
        $otherDescriptions = [];

        foreach ($sources as $source) {
            if (! is_array($source)) {
                continue;
            }

            $amount = $this->numeric($source['amount'] ?? 0.0);
            $box = is_scalar($source['box'] ?? null) ? strtolower(trim((string) $source['box'])) : null;

            if ($box === '6a') {
                $details['generalBusinessCredit'] += $amount;
            } elseif ($box === '6b') {
                $details['priorYearMinimumTaxCredit'] += $amount;
            } elseif ($box === '6z') {
                $details['otherNonrefundableCredits'] += $amount;
                $label = is_scalar($source['label'] ?? null) ? trim((string) $source['label']) : '';

                if ($label !== '') {
                    $otherDescriptions[] = "{$label} {$this->schedule3Line6DisplayAmount($amount)}";
                }
            }
        }

        if ($otherDescriptions !== []) {
            $details['otherNonrefundableCreditsDescription'] = implode('; ', $otherDescriptions);
        }

        return $details;
    }

    private function schedule3Line6DisplayAmount(float $amount): string
    {
        return (string) (int) round($amount);
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<string, mixed>
     */
    private function withBlankForm8949Current(array $facts): array
    {
        $facts['irsPdf']['form8949']['current'] = $this->form8949Instance(null, [], null, [], 'blank');

        return $facts;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, array<string, mixed>>
     */
    private function form8949Instances(array $facts): array
    {
        $instances = is_array($facts['irsPdf']['form8949']['instances'] ?? null)
            ? $facts['irsPdf']['form8949']['instances']
            : [];

        return $instances;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<int, array<string, mixed>>
     */
    private function form8949InstancesFromFacts(array $facts): array
    {
        $form8949 = is_array($facts['form8949'] ?? null) ? $facts['form8949'] : [];
        $rows = is_array($form8949['rows'] ?? null) ? array_values($form8949['rows']) : [];
        $groups = [];

        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }

            $box = $this->form8949Box($row['form8949Box'] ?? null);
            if ($box === null) {
                continue;
            }

            $groups[$box][] = $row;
        }

        $instances = [];

        foreach (['A', 'B', 'C', 'G', 'H', 'I'] as $box) {
            foreach (array_chunk($groups[$box] ?? [], self::FORM_8949_ROWS_PER_PAGE) as $chunkIndex => $chunk) {
                $instances[] = $this->form8949Instance(shortBox: $box, shortRows: $chunk, longBox: null, longRows: [], sequence: "{$box}-{$chunkIndex}");
            }
        }

        foreach (['D', 'E', 'F', 'J', 'K', 'L'] as $box) {
            foreach (array_chunk($groups[$box] ?? [], self::FORM_8949_ROWS_PER_PAGE) as $chunkIndex => $chunk) {
                $instances[] = $this->form8949Instance(shortBox: null, shortRows: [], longBox: $box, longRows: $chunk, sequence: "{$box}-{$chunkIndex}");
            }
        }

        return $instances;
    }

    /**
     * @param  array<int, array<string, mixed>>  $shortRows
     * @param  array<int, array<string, mixed>>  $longRows
     * @return array<string, mixed>
     */
    private function form8949Instance(?string $shortBox, array $shortRows, ?string $longBox, array $longRows, string $sequence): array
    {
        return [
            'sequence' => $sequence,
            'shortBox' => $shortBox,
            'shortRows' => array_values($shortRows),
            'shortTotals' => $this->form8949Totals($shortRows),
            'longBox' => $longBox,
            'longRows' => array_values($longRows),
            'longTotals' => $this->form8949Totals($longRows),
        ];
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     * @return array{proceeds: float, costBasis: float, adjustmentAmount: float, gainOrLoss: float}
     */
    private function form8949Totals(array $rows): array
    {
        $totals = [
            'proceeds' => 0.0,
            'costBasis' => 0.0,
            'adjustmentAmount' => 0.0,
            'gainOrLoss' => 0.0,
        ];

        foreach ($rows as $row) {
            $totals['proceeds'] += $this->numeric($row['proceeds'] ?? 0.0);
            $totals['costBasis'] += $this->numeric($row['costBasis'] ?? 0.0);
            $totals['adjustmentAmount'] += $this->numeric($row['adjustmentAmount'] ?? 0.0);
            $totals['gainOrLoss'] += $this->numeric($row['gainOrLoss'] ?? 0.0);
        }

        return $totals;
    }

    /**
     * @param  array<string, mixed>  $facts
     */
    private function form8949UnsupportedRowCount(array $facts): int
    {
        $form8949 = is_array($facts['form8949'] ?? null) ? $facts['form8949'] : [];
        $rows = is_array($form8949['rows'] ?? null) ? $form8949['rows'] : [];
        $unsupported = 0;

        foreach ($rows as $row) {
            if (! is_array($row) || $this->form8949Box($row['form8949Box'] ?? null) === null) {
                $unsupported++;
            }
        }

        return $unsupported;
    }

    private function form8949Box(mixed $value): ?string
    {
        if (! is_scalar($value)) {
            return null;
        }

        $box = strtoupper(trim((string) $value));

        return in_array($box, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'], true) ? $box : null;
    }

    private function numeric(mixed $value): float
    {
        return is_numeric($value) ? (float) $value : 0.0;
    }

    /**
     * @param  array<int, IrsFieldDefinition>  $fields
     * @return array<string, IrsFieldDefinition>
     */
    private function indexedFields(array $fields): array
    {
        $indexed = [];

        foreach ($fields as $field) {
            $indexed[$field->name] = $field;
        }

        return $indexed;
    }
}
