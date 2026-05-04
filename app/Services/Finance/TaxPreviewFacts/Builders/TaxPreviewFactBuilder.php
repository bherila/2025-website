<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\K1CodeCharacterResolver;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;

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
     * @param  array<string, mixed>  $data
     */
    protected function k1Field(array $data, string $box): float
    {
        return $this->parseMoney($data['fields'][$box]['value'] ?? null) ?? 0.0;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    protected function k1CodeItems(array $data, string $box, string $code): array
    {
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
        return $this->roundMoney(array_reduce(
            $this->k1CodeItems($data, $box, $code),
            fn (float $total, array $item): float => $total + ($this->parseMoney($item['value'] ?? null) ?? 0.0),
            0.0,
        ));
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function sumAbsK1CodeItems(array $data, string $box, string $code): float
    {
        return $this->roundMoney(array_reduce(
            $this->k1CodeItems($data, $box, $code),
            fn (float $total, array $item): float => $total + abs($this->parseMoney($item['value'] ?? null) ?? 0.0),
            0.0,
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

            $total += $value;
            $hasValue = true;
        }

        if (! $hasValue || $total === 0.0) {
            return null;
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    protected function sumMiscValues(array $data): ?float
    {
        $total = $this->sumNumericValues($data, self::MISC_PRIMARY_BOX_KEYS) ?? 0.0;
        $hasValue = $total !== 0.0;

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

            $total += $value;
            $hasValue = true;
        }

        if (! $hasValue || $total === 0.0) {
            return null;
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  TaxFactSource[]  $sources
     */
    protected function sumSources(array $sources): float
    {
        return $this->roundMoney(array_reduce(
            $sources,
            static fn (float $total, TaxFactSource $source): float => $total + $source->amount,
            0.0,
        ));
    }

    /**
     * @param  TaxFactSource[]  $sources
     * @param  string[]  $sourceTypes
     */
    protected function sumSourcesByTypes(array $sources, array $sourceTypes): float
    {
        return $this->roundMoney(array_reduce(
            $sources,
            static fn (float $total, TaxFactSource $source): float => $total + (in_array($source->sourceType, $sourceTypes, true) ? $source->amount : 0.0),
            0.0,
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

        return $this->roundMoney($isParentheticalNegative ? -abs($number) : $number);
    }

    protected function roundMoney(float $value): float
    {
        return round($value, 2);
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
