<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxPreviewFacts;

class TaxPreviewFactsService
{
    private const LINE_8_ROUTINGS = [
        'sch_1_line_8',
        'sch_1_8b',
        'sch_1_8h',
        'sch_1_8i',
        'sch_1_8z',
    ];

    private const MISC_PRIMARY_BOX_KEYS = [
        'box1_rents',
        'box2_royalties',
        'box3_other_income',
        'box8_substitute_payments',
    ];

    /**
     * @return array<string>
     */
    public static function supportedSlices(): array
    {
        return ['all', 'schedule1', 'form4952'];
    }

    public function factsForYear(int $userId, int $year): TaxPreviewFacts
    {
        $documents = FileForTaxDocument::where('user_id', $userId)
            ->where('tax_year', $year)
            ->whereIn('form_type', FileForTaxDocument::ACCOUNT_FORM_TYPES)
            ->with([
                'employmentEntity:id,display_name',
                'account:acct_id,acct_name,acct_number',
                'accountLinks.account:acct_id,acct_name,acct_number',
            ])
            ->orderBy('created_at', 'desc')
            ->get();

        return $this->factsFromDocuments($year, $documents);
    }

    /**
     * @param  iterable<FileForTaxDocument>  $documents
     */
    public function factsFromDocuments(int $year, iterable $documents): TaxPreviewFacts
    {
        $reviewedK1Docs = [];
        $reviewed1099Docs = [];

        foreach ($documents as $document) {
            if (! $document->is_reviewed) {
                continue;
            }

            if ($this->formType($document) === 'k1') {
                $reviewedK1Docs[] = $document;
            } else {
                $reviewed1099Docs[] = $document;
            }
        }

        return new TaxPreviewFacts(
            year: $year,
            schedule1: $this->schedule1Facts($reviewedK1Docs, $reviewed1099Docs),
            form4952: $this->form4952Facts($reviewedK1Docs, $reviewed1099Docs),
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function arrayForYear(int $userId, int $year, string $slice = 'all'): array
    {
        $facts = $this->factsForYear($userId, $year)->toArray();

        return $this->sliceArray($facts, $slice);
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return array<string, mixed>
     */
    public function sliceArray(array $facts, string $slice): array
    {
        return match ($slice) {
            'schedule1' => [
                'year' => $facts['year'],
                'schedule1' => $facts['schedule1'],
            ],
            'form4952' => [
                'year' => $facts['year'],
                'form4952' => $facts['form4952'],
            ],
            default => $facts,
        };
    }

    /**
     * @param  FileForTaxDocument[]  $reviewedK1Docs
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     */
    private function schedule1Facts(array $reviewedK1Docs, array $reviewed1099Docs): Schedule1Facts
    {
        $line5Sources = [];

        foreach ($reviewedK1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $box1 = $this->k1Field($data, '1');
            $box2 = $this->k1Field($data, '2');
            $box3 = $this->k1Field($data, '3');
            $box4 = $this->k1Field($data, '4');
            $box11ZZ = $this->sumK1CodeItems($data, '11', 'ZZ');
            $box13ZZ = $this->sumAbsK1CodeItems($data, '13', 'ZZ');
            $amount = $this->roundMoney($box1 + $box2 + $box3 + $box4 + $box11ZZ - $box13ZZ);

            if ($amount === 0.0) {
                continue;
            }

            $line5Sources[] = new TaxFactSource(
                id: "k1-{$doc->id}-schedule1-line5",
                label: "{$partnerName} — Schedule E net income/loss",
                amount: $amount,
                sourceType: 'k1_schedule_e_net',
                taxDocumentId: $doc->id,
                formType: $this->formType($doc),
                routing: 'schedule_1_line_5',
                routingReason: 'K-1 ordinary, rental, and Schedule E partnership-statement sources flow through Schedule E to Schedule 1 line 5.',
                notes: "Box 1 {$box1}; Box 2 {$box2}; Box 3 {$box3}; Box 4 {$box4}; Box 11ZZ {$box11ZZ}; Box 13ZZ -{$box13ZZ}",
            );
        }

        $line8zSources = $this->schedule1Line8zSources($reviewed1099Docs);

        return new Schedule1Facts(
            line5Sources: $line5Sources,
            line5Total: $this->sumSources($line5Sources),
            line8zSources: $line8zSources,
            line8zTotal: $this->sumSources($line8zSources),
            line9TotalOtherIncome: $this->sumSources($line8zSources),
        );
    }

    /**
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     * @return TaxFactSource[]
     */
    private function schedule1Line8zSources(array $reviewed1099Docs): array
    {
        $sources = [];

        foreach ($reviewed1099Docs as $doc) {
            $links = $doc->accountLinks;
            if ($links->isNotEmpty()) {
                foreach ($links as $link) {
                    if (! $link instanceof TaxDocumentAccount || $link->form_type !== '1099_misc') {
                        continue;
                    }

                    $entryData = $this->parsedDataForLink($doc, $link);
                    if ($entryData === null) {
                        continue;
                    }

                    $routing = $link->misc_routing ?? $doc->misc_routing;
                    if (! $this->routesToLine8($routing)) {
                        continue;
                    }

                    $amount = $this->miscAmount($doc, $link, $entryData);
                    if ($amount === null || $amount === 0.0) {
                        continue;
                    }

                    $sources[] = $this->miscSource($doc, $link, $entryData, $amount, $routing);
                }

                continue;
            }

            if ($this->formType($doc) !== '1099_misc' || ! is_array($doc->parsed_data)) {
                continue;
            }

            $routing = $doc->misc_routing;
            if (! $this->routesToLine8($routing)) {
                continue;
            }

            $amount = $this->miscAmount($doc, null, $doc->parsed_data);
            if ($amount === null || $amount === 0.0) {
                continue;
            }

            $sources[] = $this->miscSource($doc, null, $doc->parsed_data, $amount, $routing);
        }

        return $sources;
    }

    /**
     * @param  FileForTaxDocument[]  $reviewedK1Docs
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     */
    private function form4952Facts(array $reviewedK1Docs, array $reviewed1099Docs): Form4952Facts
    {
        $investmentInterestSources = [];
        $investmentExpenseSources = [];

        foreach ($reviewedK1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            foreach (['H', 'G', 'AC', 'AD'] as $code) {
                foreach ($this->k1CodeItems($data, '13', $code) as $index => $item) {
                    $rawAmount = $this->parseMoney($item['value'] ?? null);
                    if ($rawAmount === null || $rawAmount === 0.0) {
                        continue;
                    }

                    $investmentInterestSources[] = new TaxFactSource(
                        id: "k1-{$doc->id}-13{$code}-{$index}",
                        label: "{$partnerName} — Box 13{$code}",
                        amount: $this->roundMoney(-abs($rawAmount)),
                        sourceType: 'k1_investment_interest',
                        taxDocumentId: $doc->id,
                        formType: $this->formType($doc),
                        box: '13',
                        code: $code,
                        routing: 'form_4952_line_1',
                        routingReason: 'K-1 Box 13 investment-interest codes feed Form 4952 Part I.',
                        notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    );
                }
            }

            foreach ($this->k1CodeItems($data, '20', 'B') as $index => $item) {
                $rawAmount = $this->parseMoney($item['value'] ?? null);
                if ($rawAmount === null || $rawAmount === 0.0) {
                    continue;
                }

                $investmentExpenseSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-20B-{$index}",
                    label: "{$partnerName} — Box 20B (investment expenses)",
                    amount: $this->roundMoney(-abs($rawAmount)),
                    sourceType: 'k1_investment_expense',
                    taxDocumentId: $doc->id,
                    formType: $this->formType($doc),
                    box: '20',
                    code: 'B',
                    routing: 'form_4952_line_5',
                    routingReason: 'K-1 Box 20B reduces Form 4952 net investment income; it is not Schedule A line 9 investment interest.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                );
            }
        }

        foreach ($reviewed1099Docs as $doc) {
            foreach ($this->reviewed1099IntEntries($doc) as $entry) {
                $amount = $this->numericValue($entry['parsedData'], 'box5_investment_expense');
                if ($amount === null || $amount === 0.0) {
                    continue;
                }

                $payer = $this->payerName($doc, $entry['link'], $entry['parsedData']);
                $investmentInterestSources[] = new TaxFactSource(
                    id: $entry['link'] instanceof TaxDocumentAccount
                        ? "link-{$entry['link']->id}-1099-int-box5"
                        : "doc-{$doc->id}-1099-int-box5",
                    label: "{$payer} — 1099-INT Box 5 (investment expense)",
                    amount: $this->roundMoney(-abs($amount)),
                    sourceType: '1099_int_investment_expense',
                    taxDocumentId: $doc->id,
                    taxDocumentAccountId: $entry['link']?->id,
                    accountId: $entry['link']?->account_id,
                    formType: '1099_int',
                    box: '5',
                    routing: 'form_4952_line_1',
                    routingReason: 'The current client preview treats 1099-INT Box 5 as an investment-interest source for Form 4952.',
                );
            }
        }

        $totalInvestmentInterestExpense = abs($this->sumSources($investmentInterestSources));
        $totalInvestmentExpenses = abs($this->sumSources($investmentExpenseSources));
        $niiBefore = max(0.0, $this->roundMoney($this->netInvestmentIncomeGross($reviewedK1Docs, $reviewed1099Docs) - $totalInvestmentExpenses));
        $totalQualifiedDividends = $this->roundMoney($this->k1QualifiedDividends($reviewedK1Docs) + $this->direct1099QualifiedDividends($reviewed1099Docs));
        $deductible = min($totalInvestmentInterestExpense, $niiBefore);
        $carryforward = max(0.0, $this->roundMoney($totalInvestmentInterestExpense - $deductible));

        return new Form4952Facts(
            investmentInterestSources: $investmentInterestSources,
            totalInvestmentInterestExpense: $totalInvestmentInterestExpense,
            investmentExpenseSources: $investmentExpenseSources,
            totalInvestmentExpenses: $totalInvestmentExpenses,
            netInvestmentIncomeBeforeQualifiedDividendElection: $niiBefore,
            totalQualifiedDividends: $totalQualifiedDividends,
            deductibleInvestmentInterestExpense: $deductible,
            disallowedCarryforward: $carryforward,
        );
    }

    /**
     * @return array<int, array{parsedData: array<string, mixed>, link: ?TaxDocumentAccount}>
     */
    private function reviewed1099IntEntries(FileForTaxDocument $doc): array
    {
        $entries = [];
        $links = $doc->accountLinks;

        if ($links->isNotEmpty()) {
            foreach ($links as $link) {
                if (! $link instanceof TaxDocumentAccount || ! in_array($link->form_type, ['1099_int', '1099_int_c'], true)) {
                    continue;
                }

                $effectiveReviewed = $link->is_reviewed || ($this->formType($doc) === 'broker_1099' && $doc->is_reviewed && is_array($doc->parsed_data) && ! array_is_list($doc->parsed_data));
                if (! $effectiveReviewed) {
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
     * @param  FileForTaxDocument[]  $reviewedK1Docs
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     */
    private function netInvestmentIncomeGross(array $reviewedK1Docs, array $reviewed1099Docs): float
    {
        $k1Interest = 0.0;
        $k1OrdinaryDividends = 0.0;
        $k1QualifiedDividends = 0.0;
        $k1Section1256 = 0.0;
        $k1Box20A = 0.0;

        foreach ($reviewedK1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $k1Interest += $this->k1Field($data, '5');
            $k1OrdinaryDividends += $this->k1Field($data, '6a');
            $k1QualifiedDividends += $this->k1Field($data, '6b');
            $k1Section1256 += $this->sumK1CodeItems($data, '11', 'C');
            $k1Box20A += $this->sumK1CodeItems($data, '20', 'A');
        }

        $directInterest = $this->direct1099Interest($reviewed1099Docs);
        $directOrdinaryDividends = $this->direct1099OrdinaryDividends($reviewed1099Docs);
        $directQualifiedDividends = $this->direct1099QualifiedDividends($reviewed1099Docs);
        $directNonQualifiedDividends = $directOrdinaryDividends - $directQualifiedDividends;

        if ($k1Box20A > 0.0) {
            return $this->roundMoney($k1Box20A + $directInterest + $directNonQualifiedDividends);
        }

        return $this->roundMoney($k1Interest + ($k1OrdinaryDividends - $k1QualifiedDividends) + $k1Section1256 + $directInterest + $directNonQualifiedDividends);
    }

    /**
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     */
    private function direct1099Interest(array $reviewed1099Docs): float
    {
        $total = 0.0;

        foreach ($reviewed1099Docs as $doc) {
            if (in_array($this->formType($doc), ['1099_int', '1099_int_c'], true) && is_array($doc->parsed_data)) {
                $total += $this->numericValue($doc->parsed_data, 'box1_interest') ?? 0.0;
            } elseif ($this->formType($doc) === 'broker_1099' && is_array($doc->parsed_data) && ! array_is_list($doc->parsed_data)) {
                $total += $this->numericValue($doc->parsed_data, 'box1_interest') ?? 0.0;
            }
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     */
    private function direct1099OrdinaryDividends(array $reviewed1099Docs): float
    {
        $total = 0.0;

        foreach ($reviewed1099Docs as $doc) {
            if (in_array($this->formType($doc), ['1099_div', '1099_div_c'], true) && is_array($doc->parsed_data)) {
                $total += $this->numericValue($doc->parsed_data, 'box1a_ordinary') ?? 0.0;
            } elseif ($this->formType($doc) === 'broker_1099' && is_array($doc->parsed_data) && ! array_is_list($doc->parsed_data)) {
                $total += $this->numericValue($doc->parsed_data, 'box1a_ordinary') ?? 0.0;
            }
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  FileForTaxDocument[]  $reviewed1099Docs
     */
    private function direct1099QualifiedDividends(array $reviewed1099Docs): float
    {
        $total = 0.0;

        foreach ($reviewed1099Docs as $doc) {
            if (in_array($this->formType($doc), ['1099_div', '1099_div_c'], true) && is_array($doc->parsed_data)) {
                $total += $this->numericValue($doc->parsed_data, 'box1b_qualified') ?? 0.0;
            } elseif ($this->formType($doc) === 'broker_1099' && is_array($doc->parsed_data) && ! array_is_list($doc->parsed_data)) {
                $total += $this->numericValue($doc->parsed_data, 'box1b_qualified') ?? 0.0;
            }
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  FileForTaxDocument[]  $reviewedK1Docs
     */
    private function k1QualifiedDividends(array $reviewedK1Docs): float
    {
        $total = 0.0;

        foreach ($reviewedK1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data !== null) {
                $total += $this->k1Field($data, '6b');
            }
        }

        return $this->roundMoney($total);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscSource(
        FileForTaxDocument $doc,
        ?TaxDocumentAccount $link,
        array $parsedData,
        float $amount,
        ?string $routing,
    ): TaxFactSource {
        $payer = $this->payerName($doc, $link, $parsedData);

        return new TaxFactSource(
            id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-schedule1-8z" : "doc-{$doc->id}-schedule1-8z",
            label: "{$payer} — 1099-MISC other income",
            amount: $amount,
            sourceType: '1099_misc_other_income',
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: '1099_misc',
            routing: $routing ?? 'default_schedule_1_8z',
            routingReason: $routing === null
                ? 'Unrouted 1099-MISC defaults to Schedule 1 line 8z unless explicitly routed to Schedule C or Schedule E.'
                : '1099-MISC routing explicitly targets the Schedule 1 line 8 family.',
            notes: $this->miscBreakdownNote($parsedData),
        );
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscAmount(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): ?float
    {
        if ($link instanceof TaxDocumentAccount) {
            $effectiveReviewed = $link->is_reviewed || ($this->formType($doc) === 'broker_1099' && $doc->is_reviewed && is_array($doc->parsed_data) && ! array_is_list($doc->parsed_data));
            if (! $effectiveReviewed) {
                return null;
            }
        } elseif (! $doc->is_reviewed) {
            return null;
        }

        return $this->sumNumericValues($parsedData, self::MISC_PRIMARY_BOX_KEYS);
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscBreakdownNote(array $parsedData): string
    {
        $parts = [];
        foreach (self::MISC_PRIMARY_BOX_KEYS as $key) {
            $value = $this->numericValue($parsedData, $key);
            if ($value !== null && $value !== 0.0) {
                $parts[] = "{$key} {$value}";
            }
        }

        return implode('; ', $parts);
    }

    private function routesToLine8(?string $routing): bool
    {
        return $routing === null || in_array($routing, self::LINE_8_ROUTINGS, true);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function parsedDataForLink(FileForTaxDocument $doc, TaxDocumentAccount $link): ?array
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

    private function normalizedIdentifier(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $digits = preg_replace('/\D+/', '', (string) $value);

        return $digits !== '' ? $digits : null;
    }

    private function normalizedName(mixed $value): ?string
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
    private function k1PartnerName(FileForTaxDocument $doc, array $data): string
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
    private function k1Data(FileForTaxDocument $doc): ?array
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
    private function k1Field(array $data, string $box): float
    {
        return $this->parseMoney($data['fields'][$box]['value'] ?? null) ?? 0.0;
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<int, array<string, mixed>>
     */
    private function k1CodeItems(array $data, string $box, string $code): array
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
    private function sumK1CodeItems(array $data, string $box, string $code): float
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
    private function sumAbsK1CodeItems(array $data, string $box, string $code): float
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
    private function numericValue(array $data, string $key): ?float
    {
        return $this->parseMoney($data[$key] ?? null);
    }

    /**
     * @param  array<string, mixed>  $data
     * @param  string[]  $keys
     */
    private function sumNumericValues(array $data, array $keys): ?float
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
     * @param  TaxFactSource[]  $sources
     */
    private function sumSources(array $sources): float
    {
        return $this->roundMoney(array_reduce(
            $sources,
            static fn (float $total, TaxFactSource $source): float => $total + $source->amount,
            0.0,
        ));
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function payerName(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): string
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

    private function formType(FileForTaxDocument $doc): string
    {
        return (string) $doc->getAttribute('form_type');
    }

    private function parseMoney(mixed $value): ?float
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

    private function roundMoney(float $value): float
    {
        return round($value, 2);
    }
}
