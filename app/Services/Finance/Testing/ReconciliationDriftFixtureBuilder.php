<?php

namespace App\Services\Finance\Testing;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;

class ReconciliationDriftFixtureBuilder
{
    public function __construct(private readonly DocumentIngestionService $documentIngestionService) {}

    /**
     * @return array{
     *     user_id: int,
     *     tax_year: int,
     *     tax_document_id: int,
     *     account_id: int,
     *     login_path: string,
     *     reconciliation_path: string
     * }
     */
    public function build(int $taxYear = 2025): array
    {
        $user = User::factory()->create();
        $account = FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Drift Brokerage',
                'acct_number' => '4870',
                'acct_last_balance' => '0',
            ]);
        });

        $document = $this->makeBrokerDocument($user->id, $account, $taxYear);
        $brokerLot = $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);

        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
            'match_reason' => [
                'reason_code' => 'exact',
                'score' => 1.0,
                'deltas' => ['proceeds' => 0, 'basis' => 0, 'wash' => 0, 'qty' => 0, 'date_days' => 0],
                'notes' => null,
            ],
        ]);

        return [
            'user_id' => (int) $user->id,
            'tax_year' => $taxYear,
            'tax_document_id' => (int) $document->id,
            'account_id' => (int) $account->acct_id,
            'login_path' => '/login/dev-by-id',
            'reconciliation_path' => "/finance/tax-documents/{$document->id}/lot-reconciliation",
        ];
    }

    private function makeBrokerDocument(int $userId, FinAccounts $account, int $taxYear): FileForTaxDocument
    {
        $filename = 'recon-drift-1099.pdf';
        $identifier = '4870';
        $document = $this->documentIngestionService->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => $taxYear,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => "tax_docs/{$userId}/{$filename}",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', "recon-drift-fixture:{$userId}:{$taxYear}"),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
            'parsed_data' => [[
                'account_identifier' => $identifier,
                'account_name' => 'Drift Brokerage',
                'form_type' => '1099_b',
                'tax_year' => $taxYear,
                'parsed_data' => [
                    'transactions' => [[
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
                    ]],
                ],
            ]],
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', $taxYear, aiIdentifier: $identifier, aiAccountName: 'Drift Brokerage');

        return $document;
    }

    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document): FinAccountLot
    {
        return FinAccountLot::create([
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
            'document_id' => $document->document_id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ]);
    }

    private function makeAccountLot(FinAccounts $account): FinAccountLot
    {
        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 900,
            'cost_per_unit' => 90,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 350,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ]);
    }
}
