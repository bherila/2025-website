<?php

namespace App\Services\Finance\TaxPreviewFacts\Builders;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\TaxPreviewFacts\Data\ScheduleBFacts;
use App\Services\Finance\TaxPreviewFacts\Data\TaxFactSource;

class ScheduleBFactsBuilder extends TaxPreviewFactBuilder
{
    /**
     * @param  FileForTaxDocument[]  $k1Docs
     * @param  FileForTaxDocument[]  $docs1099
     */
    public function build(array $k1Docs, array $docs1099): ScheduleBFacts
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
}
