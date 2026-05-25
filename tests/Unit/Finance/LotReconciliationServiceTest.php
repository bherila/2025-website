<?php

namespace Tests\Unit\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\BrokerWashSaleTreatmentNormalizer;
use App\Services\Finance\CapitalGains\LotReconciliationService;
use App\Services\Finance\DocumentIngestionService;
use Tests\TestCase;

class LotReconciliationServiceTest extends TestCase
{
    public function test_clean_document_has_no_diagnostics(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $parsedData = $this->parsedData([
            'symbol' => 'AAPL',
            'proceeds' => 1250,
            'cost_basis' => 1000,
            'realized_gain_loss' => 250,
            'form_8949_box' => 'D',
        ], [
            'total_proceeds' => 1250,
            'total_cost_basis' => 1000,
            'total_realized_gain_loss' => 250,
        ]);
        $document = $this->makeBrokerDocument($user->id, $account, $parsedData);
        $this->makeLot($account, $document, [
            'symbol' => 'AAPL',
            'proceeds' => 1250,
            'cost_basis' => 1000,
            'realized_gain_loss' => 250,
            'form_8949_box' => 'D',
        ]);

        $report = app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray();

        $this->assertSame('ok', $report['status']);
        $this->assertSame(0, $report['summary']['diagnostics_count']);
        $this->assertSame(1, $report['entries'][0]['summary']['expected_lot_count']);
        $this->assertSame(1, $report['entries'][0]['summary']['broker_lot_count']);
    }

    public function test_reports_count_and_money_mismatches(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $parsedData = [
            'total_proceeds' => 300,
            'total_cost_basis' => 200,
            'total_realized_gain_loss' => 100,
            'transactions' => [
                $this->transaction(['symbol' => 'AAA', 'proceeds' => 100, 'cost_basis' => 50, 'realized_gain_loss' => 50]),
                $this->transaction(['symbol' => 'BBB', 'proceeds' => 200, 'cost_basis' => 150, 'realized_gain_loss' => 50]),
            ],
        ];
        $document = $this->makeBrokerDocument($user->id, $account, $parsedData);
        $this->makeLot($account, $document, [
            'symbol' => 'AAA',
            'proceeds' => 250,
            'cost_basis' => 100,
            'realized_gain_loss' => 150,
        ]);

        $codes = $this->diagnosticCodes(app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray());

        $this->assertContains('lot_count_mismatch', $codes);
        $this->assertContains('proceeds_mismatch', $codes);
        $this->assertContains('basis_mismatch', $codes);
        $this->assertContains('gain_mismatch', $codes);
    }

    public function test_reports_missing_account_link_and_unlinked_entry(): void
    {
        $user = $this->createUser();
        $parsedData = $this->parsedData();
        $missingAccountDocument = $this->makeBrokerDocument($user->id, null, $parsedData);

        $account = $this->makeAccount($user->id);
        $unlinkedDocument = $this->makeBrokerDocument($user->id, $account, $parsedData);

        $service = app(LotReconciliationService::class);

        $this->assertContains(
            'account_link_missing',
            $this->diagnosticCodes($service->reconcileTaxDocument($missingAccountDocument->id)->toArray()),
        );
        $this->assertContains(
            'parsed_entry_unlinked',
            $this->diagnosticCodes($service->reconcileTaxDocument($unlinkedDocument->id)->toArray()),
        );
    }

    public function test_reports_missing_summary_adjustment_and_unknown_treatment(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $parsedData = $this->parsedData([
            'symbol' => 'MS',
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 0,
            'wash_sale_treatment' => 'gross_of_wash_sales',
            'form_8949_box' => 'A',
            'is_short_term' => true,
        ], [
            'total_proceeds' => 1000,
            'total_cost_basis' => 1200,
            'total_wash_sale_disallowed' => 50,
            'total_realized_gain_loss' => -150,
            'wash_sale_treatment' => 'gross_of_wash_sales',
            'summary' => [
                'sections' => [[
                    'name' => 'short_term_covered_box_a',
                    'total_proceeds' => 1000,
                    'total_cost_basis' => 1200,
                    'total_wash_sales' => 50,
                    'realized_gain_loss' => -150,
                ]],
            ],
        ]);
        $document = $this->makeBrokerDocument($user->id, $account, $parsedData);
        $this->makeLot($account, $document, [
            'symbol' => 'MS',
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 0,
            'form_8949_box' => 'A',
        ]);

        $codes = $this->diagnosticCodes(app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray());

        $this->assertContains('missing_summary_adjustment', $codes);
        $this->assertContains('wash_total_mismatch', $codes);

        $unknownTreatmentDocument = $this->makeBrokerDocument($user->id, $account, $this->parsedData([
            'wash_sale_disallowed' => 25,
            'wash_sale_treatment' => 'unknown',
        ], [
            'total_wash_sale_disallowed' => 25,
        ]), 'unknown-treatment.pdf');
        $this->makeLot($account, $unknownTreatmentDocument, [
            'wash_sale_disallowed' => 25,
            'realized_gain_loss' => 275,
        ]);

        $this->assertContains(
            'treatment_unknown',
            $this->diagnosticCodes(app(LotReconciliationService::class)->reconcileTaxDocument($unknownTreatmentDocument->id)->toArray()),
        );
    }

    public function test_doc_12_shaped_wash_drift_clears_after_synthetic_rebuild(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $parsedData = $this->parsedData([
            'symbol' => 'DOC12',
            'proceeds' => 749840.20,
            'cost_basis' => 799409.88,
            'realized_gain_loss' => -49569.68,
            'wash_sale_disallowed' => 0,
            'wash_sale_treatment' => 'gross_of_wash_sales',
            'form_8949_box' => 'D',
            'is_short_term' => false,
        ], [
            'total_proceeds' => 749840.20,
            'total_cost_basis' => 799409.88,
            'total_wash_sale_disallowed' => 536.36,
            'total_realized_gain_loss' => -49033.32,
            'wash_sale_treatment' => 'gross_of_wash_sales',
            'summary' => [
                'sections' => [[
                    'name' => 'long_term_covered_box_d',
                    'total_proceeds' => 749840.20,
                    'total_cost_basis' => 799409.88,
                    'total_wash_sales' => 536.36,
                    'realized_gain_loss' => -49033.32,
                ]],
            ],
        ]);
        $document = $this->makeBrokerDocument($user->id, $account, $parsedData, 'doc-12.pdf');
        $this->makeLot($account, $document, [
            'symbol' => 'DOC12',
            'proceeds' => 749840.20,
            'cost_basis' => 799409.88,
            'realized_gain_loss' => -49569.68,
            'wash_sale_disallowed' => 0,
            'form_8949_box' => null,
        ]);

        $preRebuildCodes = $this->diagnosticCodes(app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray());
        $this->assertContains('wash_total_mismatch', $preRebuildCodes);
        $this->assertContains('box_unset', $preRebuildCodes);

        FinAccountLot::query()->where('document_id', $document->document_id)->delete();
        $this->makeLot($account, $document, [
            'symbol' => 'DOC12',
            'proceeds' => 749840.20,
            'cost_basis' => 799409.88,
            'realized_gain_loss' => -49569.68,
            'wash_sale_disallowed' => 0,
            'form_8949_box' => 'D',
        ]);
        $this->makeLot($account, $document, [
            'symbol' => 'WASHSALEADJ',
            'description' => 'Broker summary wash-sale adjustment (Form 8949 Box D)',
            'quantity' => 1,
            'purchase_date' => '2025-12-15',
            'sale_date' => '2025-12-15',
            'proceeds' => 0,
            'cost_basis' => 0,
            'realized_gain_loss' => 536.36,
            'wash_sale_disallowed' => 536.36,
            'form_8949_box' => 'D',
        ]);

        $postRebuildReport = app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray();

        $this->assertSame('ok', $postRebuildReport['status']);
        $this->assertSame([], $postRebuildReport['diagnostics']);
    }

    public function test_document_level_wash_sale_treatment_normalizes_reconciliation_totals(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $parsedData = $this->parsedData([
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 50,
        ], [
            'total_proceeds' => 1000,
            'total_cost_basis' => 1200,
            'total_wash_sale_disallowed' => 50,
            'total_realized_gain_loss' => -200,
        ]);
        $document = $this->makeBrokerDocument($user->id, $account, $parsedData, 'doc-level-wash-treatment.pdf');
        $document->update(['wash_sale_treatment' => 'gain_loss_already_reflects_wash_sales_in_basis']);
        $this->makeLot($account, $document, [
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 0,
        ]);

        $report = app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray();

        $this->assertSame('ok', $report['status']);
        $this->assertSame([], $report['diagnostics']);
        $this->assertSame(0.0, $report['entries'][0]['summary']['parsed_totals']['wash_sale_disallowed']);
        $this->assertSame(
            [BrokerWashSaleTreatmentNormalizer::TREATMENT_ALREADY_REFLECTED_IN_COST_BASIS],
            $report['entries'][0]['summary']['wash_sale_treatments'],
        );
    }

    public function test_gross_of_wash_sales_reconciliation_compares_normalized_gain_loss(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $parsedData = $this->parsedData([
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 50,
        ], [
            'total_proceeds' => 1000,
            'total_cost_basis' => 1200,
            'total_wash_sale_disallowed' => 50,
            'total_realized_gain_loss' => -200,
        ]);
        $document = $this->makeBrokerDocument($user->id, $account, $parsedData, 'gross-wash-treatment.pdf');
        $document->update(['wash_sale_treatment' => 'gain_loss_gross_of_wash_sales']);
        $this->makeLot($account, $document, [
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -150,
            'wash_sale_disallowed' => 50,
        ]);

        $report = app(LotReconciliationService::class)->reconcileTaxDocument($document->id)->toArray();

        $this->assertSame('ok', $report['status']);
        $this->assertSame([], $report['diagnostics']);
        $this->assertSame(-150.0, $report['entries'][0]['summary']['parsed_totals']['realized_gain_loss']);
    }

    private function makeAccount(int $userId, string $name = 'Brokerage', ?string $number = '1234'): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId, $name, $number): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => $name,
                'acct_number' => $number,
                'acct_last_balance' => '0',
            ]);
        });
    }

    /**
     * @param  array<string, mixed>  $parsedData
     */
    private function makeBrokerDocument(int $userId, ?FinAccounts $account, array $parsedData, string $filename = 'broker-1099.pdf'): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => "tax_docs/{$userId}/{$filename}",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => 'Brokerage',
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => $parsedData,
            ]],
        ]);

        TaxDocumentAccount::createLink(
            (int) $document->id,
            $account?->acct_id,
            '1099_b',
            2025,
            aiIdentifier: '1234',
            aiAccountName: 'Brokerage',
        );

        return $document;
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return FinAccountLot::create(array_merge([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1000,
            'cost_per_unit' => 100,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 250,
            'is_short_term' => false,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'document_id' => $document->document_id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $transactionOverrides
     * @param  array<string, mixed>  $dataOverrides
     * @return array<string, mixed>
     */
    private function parsedData(array $transactionOverrides = [], array $dataOverrides = []): array
    {
        return array_merge([
            'payer_name' => 'Synthetic Broker',
            'transactions' => [
                $this->transaction($transactionOverrides),
            ],
        ], $dataOverrides);
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function transaction(array $overrides = []): array
    {
        return array_merge([
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'cusip' => null,
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'cost_basis' => 1000,
            'wash_sale_disallowed' => 0,
            'realized_gain_loss' => 250,
            'form_8949_box' => 'D',
            'is_covered' => true,
            'is_short_term' => false,
        ], $overrides);
    }

    /**
     * @param  array<string, mixed>  $report
     * @return list<string>
     */
    private function diagnosticCodes(array $report): array
    {
        return array_values(array_map(
            static fn (array $diagnostic): string => (string) $diagnostic['code'],
            $report['diagnostics'],
        ));
    }
}
