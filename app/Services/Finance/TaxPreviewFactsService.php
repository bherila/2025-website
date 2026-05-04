<?php

namespace App\Services\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\Form4952Facts;
use App\Services\Finance\TaxPreviewFacts\Data\Schedule1Facts;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;
use App\Services\Finance\TaxPreviewFacts\Data\TaxPreviewFacts;
use Carbon\CarbonImmutable;

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
        'misc_1_rents',
        'misc_2_royalties',
        'misc_3_other_income',
        'misc_8_substitute_payments',
    ];

    /**
     * @return array<string>
     */
    public static function supportedSlices(): array
    {
        return ['all', 'schedule1', 'scheduleB', 'form4952'];
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

        return $this->factsFromDocuments(
            $year,
            $documents,
            $this->shortDividendItemizedDeduction($userId, $year),
            $this->marginInterestSources($userId, $year),
        );
    }

    /**
     * @param  iterable<FileForTaxDocument>  $documents
     * @param  TaxFactSource[]  $marginInterestSources
     */
    public function factsFromDocuments(int $year, iterable $documents, float $shortDividendDeduction = 0.0, array $marginInterestSources = []): TaxPreviewFacts
    {
        $k1Docs = [];
        $docs1099 = [];

        foreach ($documents as $document) {
            if ($this->formType($document) === 'k1') {
                $k1Docs[] = $document;
            } else {
                $docs1099[] = $document;
            }
        }

        $scheduleB = $this->scheduleBFacts($k1Docs, $docs1099);

        return new TaxPreviewFacts(
            year: $year,
            schedule1: $this->schedule1Facts($k1Docs, $docs1099),
            scheduleB: $scheduleB,
            form4952: $this->form4952Facts($k1Docs, $docs1099, $scheduleB, $shortDividendDeduction, $marginInterestSources),
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
            'scheduleB' => [
                'year' => $facts['year'],
                'scheduleB' => $facts['scheduleB'],
            ],
            'form4952' => [
                'year' => $facts['year'],
                'form4952' => $facts['form4952'],
            ],
            default => $facts,
        };
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    private function schedule1Facts(array $k1Docs, array $docs1099): Schedule1Facts
    {
        $line5Sources = [];

        foreach ($k1Docs as $doc) {
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
                isReviewed: $this->sourceIsReviewed($doc),
                reviewStatus: $this->reviewStatus($doc),
                reviewAction: $this->reviewAction($doc),
            );
        }

        $line8zSources = $this->schedule1Line8zSources($docs1099);

        return new Schedule1Facts(
            line5Sources: $line5Sources,
            line5Total: $this->sumSources($line5Sources),
            line8zSources: $line8zSources,
            line8zTotal: $this->sumSources($line8zSources),
            line9TotalOtherIncome: $this->sumSources($line8zSources),
        );
    }

    /**
     * @param  FileForTaxDocument[]  $docs1099
     * @return TaxFactSource[]
     */
    private function schedule1Line8zSources(array $docs1099): array
    {
        $sources = [];

        foreach ($docs1099 as $doc) {
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
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    private function scheduleBFacts(array $k1Docs, array $docs1099): ScheduleBFacts
    {
        $interestSources = [];
        $ordinaryDividendSources = [];
        $qualifiedDividendSources = [];

        foreach ($docs1099 as $doc) {
            foreach ($this->document1099IntEntries($doc) as $entry) {
                $interestSources = [
                    ...$interestSources,
                    ...$this->scheduleB1099InterestSources($doc, $entry['link'], $entry['parsedData']),
                ];
            }

            foreach ($this->document1099DivEntries($doc) as $entry) {
                $ordinarySource = $this->scheduleB1099OrdinaryDividendSource($doc, $entry['link'], $entry['parsedData']);
                if ($ordinarySource instanceof TaxFactSource) {
                    $ordinaryDividendSources[] = $ordinarySource;
                }

                $qualifiedSource = $this->scheduleB1099QualifiedDividendSource($doc, $entry['link'], $entry['parsedData']);
                if ($qualifiedSource instanceof TaxFactSource) {
                    $qualifiedDividendSources[] = $qualifiedSource;
                }
            }
        }

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $partnerName = $this->k1PartnerName($doc, $data);
            $interest = $this->k1Field($data, '5');
            if ($interest !== 0.0) {
                $interestSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-schedule-b-interest",
                    label: $partnerName,
                    amount: $this->roundMoney($interest),
                    sourceType: 'k1_interest_income',
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '5',
                    routing: 'schedule_b_line_1',
                    routingReason: 'K-1 Box 5 interest income is listed on Schedule B Part I.',
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }

            $ordinaryDividends = $this->k1Field($data, '6a');
            if ($ordinaryDividends !== 0.0) {
                $ordinaryDividendSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-schedule-b-ordinary-dividends",
                    label: $partnerName,
                    amount: $this->roundMoney($ordinaryDividends),
                    sourceType: 'k1_ordinary_dividends',
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '6a',
                    routing: 'schedule_b_line_5',
                    routingReason: 'K-1 Box 6a ordinary dividends are listed on Schedule B Part II.',
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }

            $qualifiedDividends = $this->k1Field($data, '6b');
            if ($qualifiedDividends !== 0.0) {
                $qualifiedDividendSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-qualified-dividends",
                    label: $partnerName,
                    amount: $this->roundMoney($qualifiedDividends),
                    sourceType: 'k1_qualified_dividends',
                    taxDocumentId: $doc->id,
                    formType: 'k1',
                    box: '6b',
                    routing: 'form_1040_line_3a',
                    routingReason: 'K-1 Box 6b qualified dividends are a subset of Box 6a and support Form 1040 line 3a / Form 4952 line 4b.',
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }
        }

        $directInterestTotal = $this->sumSourcesByTypes($interestSources, ['1099_int_interest', '1099_int_treasury_interest']);
        $interestTotal = $this->sumSources($interestSources);
        $k1InterestTotal = $this->roundMoney($interestTotal - $directInterestTotal);
        $directOrdinaryDividendTotal = $this->sumSourcesByTypes($ordinaryDividendSources, ['1099_div_ordinary_dividends']);
        $ordinaryDividendTotal = $this->sumSources($ordinaryDividendSources);
        $k1OrdinaryDividendTotal = $this->roundMoney($ordinaryDividendTotal - $directOrdinaryDividendTotal);
        $qualifiedDividendTotal = $this->sumSources($qualifiedDividendSources);

        return new ScheduleBFacts(
            interestSources: $interestSources,
            directInterestTotal: $directInterestTotal,
            k1InterestTotal: $k1InterestTotal,
            interestTotal: $interestTotal,
            ordinaryDividendSources: $ordinaryDividendSources,
            directOrdinaryDividendTotal: $directOrdinaryDividendTotal,
            k1OrdinaryDividendTotal: $k1OrdinaryDividendTotal,
            ordinaryDividendTotal: $ordinaryDividendTotal,
            qualifiedDividendSources: $qualifiedDividendSources,
            qualifiedDividendTotal: $qualifiedDividendTotal,
            form4952Line5aTotal: $this->roundMoney($directInterestTotal + $directOrdinaryDividendTotal),
        );
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     * @param  TaxFactSource[]  $marginInterestSources
     */
    private function form4952Facts(array $k1Docs, array $docs1099, ScheduleBFacts $scheduleB, float $shortDividendDeduction, array $marginInterestSources = []): Form4952Facts
    {
        $investmentInterestSources = [];
        $investmentExpenseSources = [];
        $excludedInvestmentExpenseSources = [];

        if ($shortDividendDeduction > 0.0) {
            $investmentInterestSources[] = new TaxFactSource(
                id: 'short-dividends-form4952-line1',
                label: 'Short dividends — positions held > 45 days (IRS Pub. 550)',
                amount: $this->roundMoney(-abs($shortDividendDeduction)),
                sourceType: 'short_dividend_investment_interest',
                routing: 'form_4952_line_1',
                routingReason: 'Short-dividend substitute payments on short positions held more than 45 days are treated as investment interest expense.',
                isReviewed: true,
            );
        }

        foreach ($marginInterestSources as $source) {
            $investmentInterestSources[] = $source;
        }

        foreach ($k1Docs as $doc) {
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
                        isReviewed: $this->sourceIsReviewed($doc),
                        reviewStatus: $this->reviewStatus($doc),
                        reviewAction: $this->reviewAction($doc),
                    );
                }
            }

            foreach ($this->k1CodeItems($data, '20', 'B') as $index => $item) {
                $rawAmount = $this->parseMoney($item['value'] ?? null);
                if ($rawAmount === null || $rawAmount === 0.0) {
                    continue;
                }

                $excludedInvestmentExpenseSources[] = new TaxFactSource(
                    id: "k1-{$doc->id}-20B-{$index}",
                    label: "{$partnerName} — Box 20B (investment expenses)",
                    amount: $this->roundMoney(-abs($rawAmount)),
                    sourceType: 'k1_excluded_investment_expense',
                    taxDocumentId: $doc->id,
                    formType: $this->formType($doc),
                    box: '20',
                    code: 'B',
                    routing: 'excluded_form_4952_line_5',
                    routingReason: 'K-1 Box 20B investment expenses are tracked for debugging but are excluded from the current Form 4952 line 5 return treatment.',
                    notes: is_string($item['notes'] ?? null) ? $item['notes'] : null,
                    isReviewed: $this->sourceIsReviewed($doc),
                    reviewStatus: $this->reviewStatus($doc),
                    reviewAction: $this->reviewAction($doc),
                );
            }
        }

        foreach ($docs1099 as $doc) {
            foreach ($this->document1099IntEntries($doc) as $entry) {
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
                    isReviewed: $this->sourceIsReviewed($doc, $entry['link']),
                    reviewStatus: $this->reviewStatus($doc, $entry['link']),
                    reviewAction: $this->reviewAction($doc, $entry['link']),
                );
            }
        }

        $totalInvestmentInterestExpense = abs($this->sumSources($investmentInterestSources));
        $totalInvestmentExpenses = abs($this->sumSources($investmentExpenseSources));
        $totalExcludedInvestmentExpenses = abs($this->sumSources($excludedInvestmentExpenseSources));
        $grossInvestmentIncomeFromScheduleB = $scheduleB->form4952Line5aTotal;
        $grossInvestmentIncomeFromK1 = $this->k1Form4952GrossInvestmentIncome($k1Docs);
        $grossInvestmentIncomeTotal = $this->roundMoney($grossInvestmentIncomeFromScheduleB + $grossInvestmentIncomeFromK1);
        $totalQualifiedDividends = $scheduleB->qualifiedDividendTotal;
        $niiBefore = max(0.0, $this->roundMoney($grossInvestmentIncomeTotal - $totalQualifiedDividends - $totalInvestmentExpenses));
        $deductible = min($totalInvestmentInterestExpense, $niiBefore);
        $carryforward = max(0.0, $this->roundMoney($totalInvestmentInterestExpense - $deductible));

        return new Form4952Facts(
            investmentInterestSources: $investmentInterestSources,
            totalInvestmentInterestExpense: $totalInvestmentInterestExpense,
            investmentExpenseSources: $investmentExpenseSources,
            totalInvestmentExpenses: $totalInvestmentExpenses,
            excludedInvestmentExpenseSources: $excludedInvestmentExpenseSources,
            totalExcludedInvestmentExpenses: $totalExcludedInvestmentExpenses,
            grossInvestmentIncomeFromScheduleB: $grossInvestmentIncomeFromScheduleB,
            grossInvestmentIncomeFromK1: $grossInvestmentIncomeFromK1,
            grossInvestmentIncomeTotal: $grossInvestmentIncomeTotal,
            netInvestmentIncomeBeforeQualifiedDividendElection: $niiBefore,
            totalQualifiedDividends: $totalQualifiedDividends,
            deductibleInvestmentInterestExpense: $deductible,
            disallowedCarryforward: $carryforward,
        );
    }

    /**
     * @return array<int, array{parsedData: array<string, mixed>, link: ?TaxDocumentAccount}>
     */
    private function document1099IntEntries(FileForTaxDocument $doc): array
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
    private function document1099DivEntries(FileForTaxDocument $doc): array
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
     * @param  array<string, mixed>  $parsedData
     * @return TaxFactSource[]
     */
    private function scheduleB1099InterestSources(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): array
    {
        $sources = [];
        $payer = $this->payerName($doc, $link, $parsedData);

        $box1 = $this->firstNumericOrNestedValue(
            $parsedData,
            ['box1_interest', 'int_1_interest_income'],
            ['1_interest_income'],
        );
        if ($box1 !== null && $box1 !== 0.0) {
            $sources[] = new TaxFactSource(
                id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-schedule-b-interest-box1" : "doc-{$doc->id}-schedule-b-interest-box1",
                label: $payer,
                amount: $this->roundMoney($box1),
                sourceType: '1099_int_interest',
                taxDocumentId: $doc->id,
                taxDocumentAccountId: $link?->id,
                accountId: $link?->account_id,
                formType: '1099_int',
                box: '1',
                routing: 'schedule_b_line_1',
                routingReason: '1099-INT Box 1 interest income is listed on Schedule B Part I.',
                isReviewed: $this->sourceIsReviewed($doc, $link),
                reviewStatus: $this->reviewStatus($doc, $link),
                reviewAction: $this->reviewAction($doc, $link),
            );
        }

        $box3 = $this->firstNumericOrNestedValue(
            $parsedData,
            ['box3_savings_bond', 'int_3_us_savings_bonds'],
            ['3_interest_on_us_savings_bonds_and_treasury_obligations'],
        );
        if ($box3 !== null && $box3 !== 0.0) {
            $sources[] = new TaxFactSource(
                id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-schedule-b-interest-box3" : "doc-{$doc->id}-schedule-b-interest-box3",
                label: $payer,
                amount: $this->roundMoney($box3),
                sourceType: '1099_int_treasury_interest',
                taxDocumentId: $doc->id,
                taxDocumentAccountId: $link?->id,
                accountId: $link?->account_id,
                formType: '1099_int',
                box: '3',
                routing: 'schedule_b_line_1',
                routingReason: '1099-INT Box 3 U.S. savings bond and Treasury obligation interest is listed on Schedule B Part I unless excluded on Form 8815.',
                isReviewed: $this->sourceIsReviewed($doc, $link),
                reviewStatus: $this->reviewStatus($doc, $link),
                reviewAction: $this->reviewAction($doc, $link),
            );
        }

        return $sources;
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function scheduleB1099OrdinaryDividendSource(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): ?TaxFactSource
    {
        $amount = $this->firstNumericOrNestedValue(
            $parsedData,
            ['box1a_ordinary', 'div_1a_total_ordinary'],
            ['1a_total_ordinary_dividends'],
        );
        if ($amount === null || $amount === 0.0) {
            return null;
        }

        return new TaxFactSource(
            id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-schedule-b-ordinary-dividends" : "doc-{$doc->id}-schedule-b-ordinary-dividends",
            label: $this->payerName($doc, $link, $parsedData),
            amount: $this->roundMoney($amount),
            sourceType: '1099_div_ordinary_dividends',
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: '1099_div',
            box: '1a',
            routing: 'schedule_b_line_5',
            routingReason: '1099-DIV Box 1a ordinary dividends are listed on Schedule B Part II.',
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function scheduleB1099QualifiedDividendSource(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): ?TaxFactSource
    {
        $amount = $this->firstNumericOrNestedValue(
            $parsedData,
            ['box1b_qualified', 'div_1b_qualified'],
            ['1b_qualified_dividends'],
        );
        if ($amount === null || $amount === 0.0) {
            return null;
        }

        return new TaxFactSource(
            id: $link instanceof TaxDocumentAccount ? "link-{$link->id}-qualified-dividends" : "doc-{$doc->id}-qualified-dividends",
            label: $this->payerName($doc, $link, $parsedData),
            amount: $this->roundMoney($amount),
            sourceType: '1099_div_qualified_dividends',
            taxDocumentId: $doc->id,
            taxDocumentAccountId: $link?->id,
            accountId: $link?->account_id,
            formType: '1099_div',
            box: '1b',
            routing: 'form_1040_line_3a',
            routingReason: '1099-DIV Box 1b qualified dividends are a subset of Box 1a and support Form 1040 line 3a / Form 4952 line 4b.',
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }

    /**
     * @param  FileForTaxDocument[]  $k1Docs
     */
    private function k1Form4952GrossInvestmentIncome(array $k1Docs): float
    {
        $total = 0.0;

        foreach ($k1Docs as $doc) {
            $data = $this->k1Data($doc);
            if ($data === null) {
                continue;
            }

            $box20A = $this->sumK1CodeItems($data, '20', 'A');
            $total += $box20A !== 0.0
                ? $box20A
                : $this->roundMoney($this->k1Field($data, '5') + $this->k1Field($data, '6a'));
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
            isReviewed: $this->sourceIsReviewed($doc, $link),
            reviewStatus: $this->reviewStatus($doc, $link),
            reviewAction: $this->reviewAction($doc, $link),
        );
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function miscAmount(FileForTaxDocument $doc, ?TaxDocumentAccount $link, array $parsedData): ?float
    {
        return $this->sumMiscValues($parsedData);
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
        foreach ([
            '1_rents',
            '2_royalties',
            '3_other_income',
            '8_substitute_payments_in_lieu_of_dividends_or_interest',
        ] as $key) {
            $value = $this->nestedBoxValue($parsedData, $key);
            if ($value !== null && $value !== 0.0) {
                $parts[] = "boxes.{$key} {$value}";
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
    private function firstNumericValue(array $data, array $keys): ?float
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
    private function firstNumericOrNestedValue(array $data, array $keys, array $nestedBoxKeys): ?float
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
     * @param  array<string, mixed>  $data
     */
    private function sumMiscValues(array $data): ?float
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
    private function sumSources(array $sources): float
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
    private function sumSourcesByTypes(array $sources, array $sourceTypes): float
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

    private function sourceIsReviewed(FileForTaxDocument $doc, ?TaxDocumentAccount $link = null): bool
    {
        return $link instanceof TaxDocumentAccount ? (bool) $link->is_reviewed : (bool) $doc->is_reviewed;
    }

    private function reviewStatus(FileForTaxDocument $doc, ?TaxDocumentAccount $link = null): string
    {
        return $this->sourceIsReviewed($doc, $link) ? 'reviewed' : 'needs_review';
    }

    private function reviewAction(FileForTaxDocument $doc, ?TaxDocumentAccount $link = null): ?string
    {
        if ($this->sourceIsReviewed($doc, $link)) {
            return null;
        }

        if ($link instanceof TaxDocumentAccount) {
            return "Review {$link->form_type} account link {$link->id} on tax document {$doc->id}.";
        }

        return "Review tax document {$doc->id}.";
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

    /**
     * @param  array<string, mixed>  $data
     */
    private function nestedBoxValue(array $data, string $key): ?float
    {
        $boxes = $data['boxes'] ?? null;
        if (! is_array($boxes)) {
            return null;
        }

        return $this->parseMoney($boxes[$key] ?? null);
    }

    private function shortDividendItemizedDeduction(int $userId, int $year): float
    {
        $accountIds = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $userId)
            ->pluck('acct_id')
            ->map(static fn (mixed $accountId): int => (int) $accountId)
            ->all();

        if ($accountIds === []) {
            return 0.0;
        }

        $transactions = FinAccountLineItems::whereIn('t_account', $accountIds)
            ->whereBetween('t_date', ["{$year}-01-01", "{$year}-12-31"])
            ->orderBy('t_account')
            ->orderBy('t_date')
            ->get()
            ->groupBy('t_account');

        $total = 0.0;

        foreach ($transactions as $accountTransactions) {
            foreach ($accountTransactions as $transaction) {
                if (! $this->isShortDividend($transaction)) {
                    continue;
                }

                $shortOpenDate = $this->shortOpenDate($accountTransactions->all(), $transaction);
                if ($shortOpenDate === null) {
                    continue;
                }

                $dividendDate = CarbonImmutable::parse((string) $transaction->t_date);
                $daysHeld = $shortOpenDate->diffInDays($dividendDate, false);
                if ($daysHeld > 45) {
                    $total += abs((float) $transaction->t_amt);
                }
            }
        }

        return $this->roundMoney($total);
    }

    /**
     * @return TaxFactSource[]
     */
    private function marginInterestSources(int $userId, int $year): array
    {
        $accounts = FinAccounts::withoutGlobalScopes()
            ->where('acct_owner', $userId)
            ->get(['acct_id', 'acct_name'])
            ->keyBy('acct_id');

        if ($accounts->isEmpty()) {
            return [];
        }

        $rows = FinAccountLineItems::whereIn('t_account', $accounts->keys()->all())
            ->whereBetween('t_date', ["{$year}-01-01", "{$year}-12-31"])
            ->where('t_amt', '<', 0)
            ->where(function ($query): void {
                $query->where('t_type', 'Margin Interest')
                    ->orWhere('t_comment', 'like', '%MARGIN INTEREST%');
            })
            ->get(['t_account', 't_amt'])
            ->groupBy('t_account');

        $sources = [];
        foreach ($rows as $accountId => $transactions) {
            $amount = $this->roundMoney($transactions->sum(static fn (FinAccountLineItems $transaction): float => (float) $transaction->t_amt));
            if ($amount === 0.0) {
                continue;
            }

            $account = $accounts->get($accountId);
            $accountName = $account instanceof FinAccounts ? $account->acct_name : "Account {$accountId}";
            $sources[] = new TaxFactSource(
                id: "account-{$accountId}-margin-interest",
                label: "{$accountName} — Margin interest paid",
                amount: $amount,
                sourceType: 'brokerage_margin_interest',
                accountId: (int) $accountId,
                routing: 'form_4952_line_1',
                routingReason: 'Brokerage margin-interest transactions are investment interest expense for Form 4952 Part I.',
                isReviewed: true,
            );
        }

        return $sources;
    }

    private function isShortDividend(FinAccountLineItems $transaction): bool
    {
        if ($transaction->t_type !== 'Dividend' || (float) $transaction->t_amt >= 0.0) {
            return false;
        }

        $description = strtoupper(trim((string) $transaction->t_description.' '.(string) $transaction->t_comment));

        return str_contains($description, 'SHORT')
            || str_contains($description, 'CHARGED')
            || str_contains($description, 'SHORT SALE');
    }

    /**
     * @param  FinAccountLineItems[]  $transactions
     */
    private function shortOpenDate(array $transactions, FinAccountLineItems $dividend): ?CarbonImmutable
    {
        $symbol = (string) $dividend->t_symbol;
        if ($symbol === '') {
            return null;
        }

        $dividendDate = (string) $dividend->t_date;
        $openDate = null;

        foreach ($transactions as $transaction) {
            if ((string) $transaction->t_symbol !== $symbol
                || $transaction->t_type !== 'Sell Short'
                || (string) $transaction->t_date > $dividendDate) {
                continue;
            }

            if ($openDate === null || (string) $transaction->t_date > $openDate) {
                $openDate = (string) $transaction->t_date;
            }
        }

        return $openDate !== null ? CarbonImmutable::parse($openDate) : null;
    }
}
