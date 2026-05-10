<?php

namespace Tests\Unit\Finance;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotImportFromParsedDataService;
use ReflectionMethod;
use Tests\TestCase;

class LotImportFromParsedDataServiceTest extends TestCase
{
    public function test_rebuild_creates_lots_from_parsed_data_and_reports_counts(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account, $this->parsedData());
        $staleLot = $this->makeLot($account, $document, [
            'symbol' => 'STALE',
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);

        $result = app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $document->id);

        $this->assertSame(1, $result->insertedCount);
        $this->assertSame(1, $result->deletedCount);
        $this->assertSame([], $result->warnings);
        $this->assertCount(1, $result->lotIds);
        $this->assertDatabaseMissing('fin_account_lots', ['lot_id' => $staleLot->lot_id]);

        $lot = FinAccountLot::query()->whereKey($result->lotIds[0])->firstOrFail();
        $this->assertSame('AAPL', $lot->symbol);
        $this->assertSame(FinAccountLot::SOURCE_1099B, $lot->lot_source);
        $this->assertSame(FinAccountLot::SOURCE_BROKER_1099B, $lot->source);
        $this->assertSame(250.0, (float) $lot->realized_gain_loss);
        $this->assertSame('D', $lot->form_8949_box);
    }

    public function test_rebuild_warns_and_skips_when_account_link_is_missing(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account, $this->parsedData(), createLink: false);

        $result = app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $document->id);

        $this->assertSame(0, $result->insertedCount);
        $this->assertSame(0, $result->deletedCount);
        $this->assertCount(1, $result->warnings);
        $this->assertStringContainsString('did not resolve to a finance account', $result->warnings[0]);
        $this->assertSame(0, FinAccountLot::query()->where('tax_document_id', $document->id)->count());
    }

    public function test_rebuild_clears_stale_broker_lots_when_no_1099_b_entries_exist(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => 'broker-1099.pdf',
            's3_path' => "tax_docs/{$user->id}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('b', 64),
            'uploaded_by_user_id' => $user->id,
            'genai_status' => 'parsed',
            'parsed_data' => [[
                'account_identifier' => '1234',
                'account_name' => 'Brokerage',
                'form_type' => '1099_div',
                'tax_year' => 2025,
                'parsed_data' => ['box1a_ordinary' => 10],
            ]],
        ]);
        $this->makeLot($account, $document, ['source' => FinAccountLot::SOURCE_BROKER_1099B]);

        $result = app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $document->id);

        $this->assertSame(0, $result->insertedCount);
        $this->assertSame(1, $result->deletedCount);
        $this->assertSame([], $result->warnings);
        $this->assertSame(0, FinAccountLot::query()->where('tax_document_id', $document->id)->count());
    }

    public function test_rebuild_synthesizes_summary_wash_sale_adjustment_and_warns_on_row_delta(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account, $this->parsedData([
            'symbol' => 'MS',
            'description' => 'Morgan Stanley lot',
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
        ]));

        $result = app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $document->id);

        $this->assertSame(2, $result->insertedCount);
        $this->assertStringContainsString('wash-sale summary total 50.00 does not match parsed row total 0.00', $result->warnings[0]);
        $this->assertDatabaseHas('fin_account_lots', [
            'tax_document_id' => $document->id,
            'symbol' => 'WASHSALEADJ',
            'source' => FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
            'wash_sale_disallowed' => 50,
            'realized_gain_loss' => 50,
            'form_8949_box' => 'A',
        ]);
    }

    public function test_service_rows_match_parse_import_job_rows_for_same_fixture(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id, 'Fidelity Brokerage', 'X65-385336');
        $data = [[
            'account_identifier' => 'X65-385336',
            'account_name' => 'Fidelity',
            'form_type' => '1099_b',
            'tax_year' => 2025,
            'parsed_data' => $this->parsedData(),
        ]];

        $jobDocument = $this->makePendingBrokerDocument($user->id);
        $genaiJob = $this->makeGenAiJob($user->id, (int) $jobDocument->id);
        $jobDocument->update(['genai_job_id' => $genaiJob->id]);
        $job = new ParseImportJob((int) $genaiJob->id);
        $method = new ReflectionMethod($job, 'createMultiAccountTaxDocumentResults');
        $method->setAccessible(true);
        $method->invoke($job, $genaiJob, $data);

        $serviceDocument = $this->makeBrokerDocument($user->id, $account, $this->parsedData(), filename: 'service-1099.pdf');
        app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $serviceDocument->id);

        $this->assertSame(
            $this->canonicalLotRows((int) $jobDocument->id),
            $this->canonicalLotRows((int) $serviceDocument->id),
        );
    }

    public function test_rebuild_is_idempotent_and_corrects_doc_12_style_stale_lots(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account, $this->parsedData([
            'symbol' => 'DOC12',
            'description' => 'Doc 12 stale wash lot',
            'proceeds' => 1000,
            'cost_basis' => 1200,
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 50,
            'wash_sale_treatment' => 'gross_of_wash_sales',
            'form_8949_box' => 'A',
            'is_short_term' => true,
        ], [
            'total_proceeds' => 1000,
            'total_cost_basis' => 1200,
            'total_wash_sale_disallowed' => 50,
            'total_realized_gain_loss' => -150,
            'wash_sale_treatment' => 'gross_of_wash_sales',
        ]));
        $this->makeLot($account, $document, [
            'symbol' => 'DOC12',
            'realized_gain_loss' => -200,
            'wash_sale_disallowed' => 0,
            'form_8949_box' => null,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);

        $first = app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $document->id);
        $firstRows = $this->canonicalLotRows((int) $document->id);
        $second = app(LotImportFromParsedDataService::class)->rebuildForTaxDocument((int) $document->id);

        $this->assertSame(1, $first->insertedCount);
        $this->assertSame(1, $first->deletedCount);
        $this->assertSame(1, $second->insertedCount);
        $this->assertSame(1, $second->deletedCount);
        $this->assertSame($firstRows, $this->canonicalLotRows((int) $document->id));
        $this->assertDatabaseHas('fin_account_lots', [
            'tax_document_id' => $document->id,
            'symbol' => 'DOC12',
            'wash_sale_disallowed' => 50,
            'realized_gain_loss' => -150,
            'form_8949_box' => 'A',
        ]);
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

    private function makeBrokerDocument(
        int $userId,
        FinAccounts $account,
        array $parsedData,
        bool $createLink = true,
        string $filename = 'broker-1099.pdf',
    ): FileForTaxDocument {
        $document = FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => "tax_docs/{$userId}/{$filename}",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('c', 64),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'parsed',
            'parsed_data' => [[
                'account_identifier' => $account->acct_number,
                'account_name' => $account->acct_name,
                'form_type' => '1099_b',
                'tax_year' => 2025,
                'parsed_data' => $parsedData,
            ]],
        ]);

        if ($createLink) {
            TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: $account->acct_number, aiAccountName: $account->acct_name);
        }

        return $document;
    }

    private function makePendingBrokerDocument(int $userId): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'job-1099.pdf',
            'stored_filename' => 'job-1099.pdf',
            's3_path' => "tax_docs/{$userId}/job-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('d', 64),
            'uploaded_by_user_id' => $userId,
            'genai_status' => 'processing',
        ]);
    }

    private function makeGenAiJob(int $userId, int $taxDocumentId): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $userId,
            'job_type' => 'tax_form_multi_account_import',
            'file_hash' => str_repeat('e', 64),
            'original_filename' => 'job-1099.pdf',
            's3_path' => "tax_docs/{$userId}/job-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'context_json' => json_encode([
                'tax_document_id' => $taxDocumentId,
                'tax_year' => 2025,
                'accounts' => [],
            ]),
            'status' => 'processing',
        ]);
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
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'tax_document_id' => $document->id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $transactionOverrides
     * @param  array<string, mixed>  $parsedOverrides
     * @return array<string, mixed>
     */
    private function parsedData(array $transactionOverrides = [], array $parsedOverrides = []): array
    {
        return array_merge([
            'payer_name' => 'Synthetic Broker',
            'total_proceeds' => 1250,
            'total_cost_basis' => 1000,
            'total_realized_gain_loss' => 250,
            'transactions' => [
                $this->transaction($transactionOverrides),
            ],
        ], $parsedOverrides);
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
     * @return array<int, array<string, mixed>>
     */
    private function canonicalLotRows(int $taxDocumentId): array
    {
        return FinAccountLot::query()
            ->where('tax_document_id', $taxDocumentId)
            ->orderBy('symbol')
            ->get()
            ->map(fn (FinAccountLot $lot): array => [
                'symbol' => $lot->symbol,
                'description' => $lot->description,
                'quantity' => (float) $lot->quantity,
                'purchase_date' => $lot->purchase_date?->format('Y-m-d'),
                'sale_date' => $lot->sale_date?->format('Y-m-d'),
                'cost_basis' => (float) $lot->cost_basis,
                'cost_per_unit' => (float) $lot->cost_per_unit,
                'proceeds' => (float) $lot->proceeds,
                'realized_gain_loss' => (float) $lot->realized_gain_loss,
                'wash_sale_disallowed' => (float) $lot->wash_sale_disallowed,
                'form_8949_box' => $lot->form_8949_box,
                'is_covered' => $lot->is_covered,
                'is_short_term' => $lot->is_short_term,
                'lot_source' => $lot->lot_source,
                'source' => $lot->source,
            ])
            ->values()
            ->all();
    }
}
