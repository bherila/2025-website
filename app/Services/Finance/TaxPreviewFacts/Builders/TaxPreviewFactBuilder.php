<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\MoneyMath;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSourceType;

abstract class TaxPreviewFactBuilder
{
    protected const LINE_8_ROUTINGS = [
        'sch_1_line_8',
        'sch_1_8b',
        'sch_1_8h',
        'sch_1_8i',
        'sch_1_8z',
    ];

    protected const MISC_PRIMARY_BOX_KEYS = [
        'box1_rents',
        'box2_royalties',
        'box3_other_income',
        'box8_substitute_payments',
        'misc_1_rents',
        'misc_2_royalties',
        'misc_3_other_income',
        'misc_8_substitute_payments',
    ];

    public function __construct(
        protected readonly K1CodeCharacterResolver $k1CodeCharacterResolver,
    ) {}

    /**
     * @return array<int, array{parsedData: array<string, mixed>, link: ?TaxDocumentAccount}>
     */
    protected function document1099IntEntries(FileForTaxDocument $doc): array
    {
        $entries = [];
        $links = $doc->accountLinks;

        if ($links->isNotEmpty()) {
            foreach ($links as $link) {
                if (! $link instanceof TaxDocumentAccount || ! in_array($link->form_type, ['1099_int', '1099_int_c'], true)) {
                    continue;
                }

                $parsedData = $this->parsedDataForLink($doc, $link);
                if ($parsedData !== null) {
                    $entries[] = ['parsedData' => $parsedData, 'link' => $link];
                }
            }

            return $entries;
        }

        if (in_array($this->formType($doc), ['1099_int', '1099_int_c'], true) && is_array($doc->parsed_data)) {
            $entries[] = ['parsedData' => $doc->parsed_data, 'link' => null];
        }

        return $entries;
    }

    /**
     * @return array<int, array{parsedData: array<string, mixed>, link: ?TaxDocumentAccount}>
     */
    protected function document1099DivEntries(FileForTaxDocument $doc): array
    {
        $entries = [];
        $links = $doc->accountLinks;

        if ($links->isNotEmpty()) {
            foreach ($links as $link) {
                if (! $link instanceof TaxDocumentAccount || ! in_array($link->form_type, ['1099_div', '1099_div_c'], true)) {
                    continue;
                }

                $parsedData = $this->parsedDataForLink($doc, $link);
                if ($parsedData !== null) {
                    $entries[] = ['parsedData' => $parsedData, 'link' => $link];
                }
            }

            return $entries;
        }

        if (in_array($this->formType($doc), ['1099_div', '1099_div_c'], true) && is_array($doc->parsed_data)) {
            $entries[] = ['parsedData' => $doc->parsed_data, 'link' => null];
        }

        return $entries;
    }

    /**
     * @param  string[]  $formTypes
     * @return array<int, array{parsedData: array<string, mixed>, link: ?TaxDocumentAccount}>
     */
    protected function documentEntriesForFormTypes(FileForTaxDocument $doc, array $formTypes): array
    {
        $entries = [];

        if ($doc->accountLinks->isNotEmpty()) {
            foreach ($doc->accountLinks as $link) {
                if (! $link instanceof TaxDocumentAccount || ! in_array($link->form_type, $formTypes, true)) {
                    continue;
                }

                $parsedData = $this->parsedDataForLink($doc, $link);
                if ($parsedData !== null) {
                    $entries[] = ['parsedData' => $parsedData, 'link' => $link];
                }
            }

            return $entries;
        }

        if (in_array($this->formType($doc), $formTypes, true) && is_array($doc->parsed_data)) {
            $entries[] = ['parsedData' => $doc->parsed_data, 'link' => null];
        }

        return $entries;
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function parsedDataForLink(FileForTaxDocument $doc, TaxDocumentAccount $link): ?array
    {
        $parsedData = $doc->parsed_data;
        if (! is_array($parsedData)) {
            return null;
        }

        if ($this->formType($doc) === 'broker_1099' && ! array_is_list($parsedData)) {
            return $parsedData;
        }

        if (! array_is_list($parsedData)) {
            return $parsedData;
        }

        $candidates = array_values(array_filter(
            $parsedData,
            static fn (mixed $entry): bool => is_array($entry) && ($entry['form_type'] ?? null) === $link->form_type,
        ));

        if (count($candidates) === 1) {
            $entry = $candidates[0];

            return is_array($entry['parsed_data'] ?? null) ? $entry['parsed_data'] : null;
        }

        $linkIdentifier = $this->normalizedIdentifier($link->ai_identifier);
        if ($linkIdentifier !== null) {
            $identified = array_values(array_filter($candidates, function (array $entry) use ($linkIdentifier): bool {
                $identifier = $this->normalizedIdentifier($entry['account_identifier'] ?? null);

                return $identifier !== null && $identifier === $linkIdentifier;
            }));

            if (count($identified) === 1) {
                return is_array($identified[0]['parsed_data'] ?? null) ? $identified[0]['parsed_data'] : null;
            }

            if (count($identified) > 1) {
                return null;
            }
        }

        $identified = array_values(array_filter($candidates, function (array $entry) use ($link): bool {
            $identifier = $this->normalizedIdentifier($entry['account_identifier'] ?? null);
            $linkIdentifier = $this->normalizedIdentifier($link->ai_identifier);

            if ($identifier !== null && $linkIdentifier !== null && $identifier === $linkIdentifier) {
                return true;
            }

            $entryName = $this->normalizedName($entry['account_name'] ?? null);
            $linkName = $this->normalizedName($link->ai_account_name);

            return $entryName !== null && $linkName !== null && $entryName === $linkName;
        }));

        if (count($identified) !== 1) {
            return null;
        }

        return is_array($identified[0]['parsed_data'] ?? null) ? $identified[0]['parsed_data'] : null;
    }

    protected function normalizedIdentifier(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', (string) $value);

        return $digits !== '' ? $digits : null;
    }

    protected function normalizedName(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $normalized = strtolower(trim(preg_replace('/\s+/', ' ', $value) ?? ''));

        return $normalized !== '' ? $normalized : null;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function k1PartnerName(FileForTaxDocument $doc, array $data): string
    {
        $fieldValue = $data['fields']['B']['value'] ?? null;
        if (is_string($fieldValue) && trim($fieldValue) !== '') {
            return explode("\n", $fieldValue)[0];
        }

        $entity = $doc->employmentEntity;

        return $entity instanceof FinEmploymentEntity ? $entity->display_name : 'Partnership';
    }

    /**
     * @return array<string, mixed>|null
     */
    protected function k1Data(FileForTaxDocument $doc): ?array
    {
        $data = $doc->parsed_data;

        if (! is_array($data)) {
            return null;
        }

        if (! is_string($data['schemaVersion'] ?? null) || ! is_array($data['fields'] ?? null) || ! is_array($data['codes'] ?? null)) {
            return null;
        }

        return $data;
    }

    /**
     * Whether this K-1 represents an interest in a partnership engaged in the
     * trade or business of trading securities for its own account.
     *
     * Used to classify the partner's Box 13 investment-interest expense:
     * trader-fund interest is §163(d)(5)(A)(ii) "property held for investment"
     * for a non-materially-participating partner (Rev. Rul. 2008-12 / 2008-38),
     * so the allowed deduction is reported above-the-line on Schedule E Part II;
     * ordinary investor interest is §163(d)(5)(A)(i) and goes to Schedule A line 9.
     *
     * @param  array<string, mixed>  $data
     */
    protected function isTraderFundK1(array $data): bool
    {
        $structuredTraderStatus = $data['fields']['partnershipPosition_traderInSecurities']['value'] ?? null;
        if ($structuredTraderStatus === 'true') {
            return true;
        }

        if ($structuredTraderStatus === 'false') {
            return false;
        }

        $warnings = is_array($data['warnings'] ?? null) ? $data['warnings'] : [];
        $notes = [];
        foreach ($data['codes'] ?? [] as $items) {
            if (! is_array($items)) {
                continue;
            }

            foreach ($items as $item) {
                if (is_array($item) && is_string($item['notes'] ?? null)) {
                    $notes[] = $item['notes'];
                }
            }
        }

        $haystack = strtolower(implode(' ', array_filter([
            is_string($data['raw_text'] ?? null) ? $data['raw_text'] : null,
            ...array_filter($warnings, 'is_string'),
            ...$notes,
        ])));

        // Some K-1 packages deny entity-level trader status while still reporting
        // trader-style deductions that belong in the Form 8960 NII audit trail.
        if (preg_match('/\b(?:not|isn\'t|is not|was not|no)\s+(?:a\s+)?trader in securities\b/i', $haystack)) {
            foreach (['trader deductions', 'trading activities', 'trading in financial instruments', 'trading in financial instruments/commodities'] as $needle) {
                if (str_contains($haystack, $needle)) {
                    return true;
                }
            }

            return false;
        }

        foreach (['trader in securities', 'trader deductions', 'trading activities', 'trading in financial instruments', 'trading in financial instruments/commodities'] as $needle) {
            if (str_contains($haystack, $needle)) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function k1Field(array $data, string $box): float
    {
        $override = $this->k1SourceOverrideValue($data, $this->k1FieldOverrideKey($box));
        if ($override !== null) {
            return $override;
        }

        return $this->parseMoney($data['fields'][$box]['value'] ?? null) ?? 0.0;
    }

    protected function k1FieldOverrideKey(string $box): string
    {
        return "field:{$box}";
    }

    protected function k1CodeOverrideKey(string $box, string $code): string
    {
        return sprintf('code:%s:%s', $box, strtoupper(trim($code)));
    }

    protected function k3ForeignTaxTotalOverrideKey(): string
    {
        return 'k3:foreign-tax-total';
    }

    protected function k1MaterialParticipationOverrideKey(): string
    {
        return 'k1:material-participation';
    }

    protected function k1Form4952TracingSplitOverrideKey(string $box, string $code): string
    {
        return sprintf('form4952:tracing:code:%s:%s', $box, strtoupper(trim($code)));
    }

    protected function k3Part2OverrideKey(string $line, string $category): string
    {
        return "k3:part2:{$line}:{$category}";
    }

    protected function k3Part3OverrideKey(string $country): string
    {
        return "k3:part3:{$country}";
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function k1SourceOverrideValue(array $data, string $key): ?float
    {
        $overrides = $data['sourceValueOverrides'] ?? null;
        if (! is_array($overrides)) {
            return null;
        }

        $override = $overrides[$key] ?? null;
        if (! is_array($override)) {
            return null;
        }

        return $this->parseMoney($override['value'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function k1MaterialParticipationOverrideValue(array $data): bool
    {
        $overrides = $data['sourceValueOverrides'] ?? null;
        if (! is_array($overrides)) {
            return false;
        }

        $override = $overrides[$this->k1MaterialParticipationOverrideKey()] ?? null;
        if (! is_array($override)) {
            return false;
        }

        $value = $override['value'] ?? null;
        if (is_bool($value)) {
            return $value;
        }

        if (is_numeric($value)) {
            return (float) $value !== 0.0;
        }

        if (! is_string($value)) {
            return false;
        }

        return in_array(strtolower(trim($value)), ['true', '1', 'yes', 'y'], true);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array{scheduleA:float,scheduleE:float}|null
     */
    protected function k1Form4952TracingSplitOverrideValue(array $data, string $box, string $code): ?array
    {
        $overrides = $data['sourceValueOverrides'] ?? null;
        if (! is_array($overrides)) {
            return null;
        }

        $override = $overrides[$this->k1Form4952TracingSplitOverrideKey($box, $code)] ?? null;
        if (! is_array($override)) {
            return null;
        }

        $value = $override['value'] ?? null;
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : null;
        }

        if (! is_array($value)) {
            return null;
        }

        $scheduleA = $this->parseMoney($value['scheduleA'] ?? $value['schedule_a'] ?? $value['schA'] ?? null);
        $scheduleE = $this->parseMoney($value['scheduleE'] ?? $value['schedule_e'] ?? $value['schE'] ?? null);
        if ($scheduleA === null || $scheduleE === null) {
            return null;
        }

        $scheduleA = max(0.0, abs($scheduleA));
        $scheduleE = max(0.0, abs($scheduleE));
        if ($scheduleA === 0.0 && $scheduleE === 0.0) {
            return null;
        }

        return [
            'scheduleA' => $scheduleA,
            'scheduleE' => $scheduleE,
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    protected function k1CodeItems(array $data, string $box, string $code): array
    {
        $override = $this->k1SourceOverrideValue($data, $this->k1CodeOverrideKey($box, $code));
        if ($override !== null) {
            return [[
                'code' => strtoupper(trim($code)),
                'value' => (string) $override,
                'manualOverride' => true,
                'notes' => 'All-in-One source value override',
            ]];
        }

        $items = $data['codes'][$box] ?? [];
        if (! is_array($items)) {
            return [];
        }

        return array_values(array_filter($items, static function (mixed $item) use ($code): bool {
            return is_array($item) && strtoupper(trim((string) ($item['code'] ?? ''))) === strtoupper($code);
        }));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function sumK1CodeItems(array $data, string $box, string $code): float
    {
        return $this->sumMoney(array_map(
            fn (array $item): float => $this->parseMoney($item['value'] ?? null) ?? 0.0,
            $this->k1CodeItems($data, $box, $code),
        ));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function sumAbsK1CodeItems(array $data, string $box, string $code): float
    {
        return $this->sumMoney(array_map(
            fn (array $item): float => abs($this->parseMoney($item['value'] ?? null) ?? 0.0),
            $this->k1CodeItems($data, $box, $code),
        ));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function numericValue(array $data, string $key): ?float
    {
        return $this->parseMoney($data[$key] ?? null);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]  $keys
     */
    protected function firstNumericValue(array $data, array $keys): ?float
    {
        foreach ($keys as $key) {
            $value = $this->numericValue($data, $key);
            if ($value !== null) {
                return $value;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]  $keys
     * @param  string[]  $nestedBoxKeys
     */
    protected function firstNumericOrNestedValue(array $data, array $keys, array $nestedBoxKeys): ?float
    {
        $value = $this->firstNumericValue($data, $keys);
        if ($value !== null) {
            return $value;
        }

        foreach ($nestedBoxKeys as $key) {
            $nestedValue = $this->nestedBoxValue($data, $key);
            if ($nestedValue !== null) {
                return $nestedValue;
            }
        }

        return null;
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]  $keys
     */
    protected function sumNumericValues(array $data, array $keys): ?float
    {
        $total = 0.0;
        $hasValue = false;

        foreach ($keys as $key) {
            $value = $this->numericValue($data, $key);
            if ($value === null) {
                continue;
            }

            $total = $this->sumMoney([$total, $value]);
            $hasValue = true;
        }

        if (! $hasValue) {
            return null;
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function sumMiscValues(array $data): ?float
    {
        $primaryTotal = $this->sumNumericValues($data, self::MISC_PRIMARY_BOX_KEYS);
        $total = $primaryTotal ?? 0.0;
        $hasValue = $primaryTotal !== null;

        foreach ([
            '1_rents',
            '2_royalties',
            '3_other_income',
            '8_substitute_payments_in_lieu_of_dividends_or_interest',
        ] as $key) {
            $value = $this->nestedBoxValue($data, $key);
            if ($value === null) {
                continue;
            }

            $total = $this->sumMoney([$total, $value]);
            $hasValue = true;
        }

        if (! $hasValue) {
            return null;
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  TaxFactSource[]  $sources
     */
    protected function sumSources(array $sources): float
    {
        return $this->sumMoney(array_map(
            static fn (TaxFactSource $source): float => $source->amount,
            $sources,
        ));
    }

    /**
     * @param  TaxFactSource[]  $sources
     */
    protected function sumAbsoluteSources(array $sources): float
    {
        return $this->sumMoney(array_map(
            static fn (TaxFactSource $source): float => abs($source->amount),
            $sources,
        ));
    }

    /**
     * @param  TaxFactSource[]  $sources
     * @param  TaxFactSourceType[]  $sourceTypes
     */
    protected function sumSourcesByTypes(array $sources, array $sourceTypes): float
    {
        $sourceTypeValues = array_map(
            static fn (TaxFactSourceType $sourceType): string => $sourceType->value,
            $sourceTypes,
        );

        return $this->sumMoney(array_map(
            static fn (TaxFactSource $source): float => in_array($source->sourceType, $sourceTypeValues, true) ? $source->amount : 0.0,
            $sources,
        ));
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    protected function payerName(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): string
    {
        $payer = $parsedData['payer_name'] ?? null;
        if (is_string($payer) && trim($payer) !== '') {
            return $payer;
        }

        $linkAccount = $link?->account;
        $docAccount = $doc->account;
        $entity = $doc->employmentEntity;

        return ($linkAccount instanceof FinAccounts ? $linkAccount->acct_name : null)
            ?? ($docAccount instanceof FinAccounts ? $docAccount->acct_name : null)
            ?? ($entity instanceof FinEmploymentEntity ? $entity->display_name : null)
            ?? $doc->original_filename
            ?? 'Tax document';
    }

    protected function formType(FileForTaxDocument $doc): string
    {
        return (string) $doc->getAttribute('form_type');
    }

    protected function sourceIsReviewed(FileForTaxDocument $doc, ?TaxDocumentAccount $link = null): bool
    {
        return $link instanceof TaxDocumentAccount ? (bool) $link->is_reviewed : (bool) $doc->is_reviewed;
    }

    protected function reviewStatus(FileForTaxDocument $doc, ?TaxDocumentAccount $link = null): string
    {
        return $this->sourceIsReviewed($doc, $link) ? 'reviewed' : 'needs_review';
    }

    protected function reviewAction(FileForTaxDocument $doc, ?TaxDocumentAccount $link = null): ?string
    {
        if ($this->sourceIsReviewed($doc, $link)) {
            return null;
        }

        if ($link instanceof TaxDocumentAccount) {
            return "Review {$link->form_type} account link {$link->id} on tax document {$doc->id}.";
        }

        return "Review tax document {$doc->id}.";
    }

    protected function parseMoney(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        if (is_int($value) || is_float($value)) {
            return $this->roundMoney((float) $value);
        }

        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }

        $isParentheticalNegative = str_starts_with($trimmed, '(') && str_ends_with($trimmed, ')');
        $normalized = str_replace([',', '$', '(', ')'], '', $trimmed);
        if (! is_numeric($normalized)) {
            return null;
        }

        $number = (float) $normalized;

        return MoneyMath::round($isParentheticalNegative ? -abs($number) : $number);
    }

    protected function roundMoney(float $value): float
    {
        return MoneyMath::round($value);
    }

    /**
     * @param  array<int, float|int|string>  $values
     */
    protected function sumMoney(array $values): float
    {
        return MoneyMath::sum($values);
    }

    protected function subtractMoney(float|int|string $left, float|int|string $right): float
    {
        return MoneyMath::subtract($left, $right);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function nestedBoxValue(array $data, string $key): ?float
    {
        $boxes = $data['boxes'] ?? null;
        if (! is_array($boxes)) {
            return null;
        }

        return $this->parseMoney($boxes[$key] ?? null);
    }
}
