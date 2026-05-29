<?php

namespace App\Services\Finance\Testing;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ReconciliationDriftFixtureBuilder
{
    private const string DEFAULT_OWNER_EMAIL = 'e2e-recon@example.test';

    private const string ACCOUNT_NAME = 'E2E Reconciliation Brokerage';

    private const string ACCOUNT_NUMBER = '4870';

    private const string SYMBOL = 'E2E487';

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
    public function build(int $taxYear = 2025, string $ownerEmail = self::DEFAULT_OWNER_EMAIL): array
    {
        return DB::transaction(function () use ($taxYear, $ownerEmail): array {
            $user = $this->owner($ownerEmail);
            $account = $this->account($user);
            $document = $this->makeBrokerDocument($user, $account, $taxYear);

            $documentId = (int) $document->document_id;
            $this->clearFixtureRows($documentId, $account);
            TaxDocumentAccount::createLink(
                (int) $document->id,
                $account->acct_id,
                '1099_b',
                $taxYear,
                aiIdentifier: self::ACCOUNT_NUMBER,
                aiAccountName: self::ACCOUNT_NAME,
            );

            $brokerLot = $this->makeBrokerLot($account, $document);
            $accountLot = $this->makeAccountLot($account);

            FinLotReconciliationLink::create([
                'document_id' => $documentId,
                'broker_lot_id' => $brokerLot->lot_id,
                'account_lot_id' => $accountLot->lot_id,
                'state' => FinLotReconciliationLink::STATE_NEEDS_REVIEW,
                'match_reason' => [
                    'reason_code' => 'basis_delta',
                    'score' => 0.91,
                    'deltas' => ['proceeds' => 0, 'basis' => 300, 'wash' => 0, 'qty' => 0, 'date_days' => 0],
                    'notes' => null,
                ],
            ]);

            Cache::forever(LotMatcherService::lastMatchedAtCacheKey($documentId), now()->toJSON());

            return [
                'user_id' => (int) $user->id,
                'tax_year' => $taxYear,
                'tax_document_id' => (int) $document->id,
                'account_id' => (int) $account->acct_id,
                'login_path' => '/login/dev-by-id',
                'reconciliation_path' => "/finance/tax-documents/{$document->id}/lot-reconciliation",
            ];
        });
    }

    private function owner(string $ownerEmail): User
    {
        $email = trim($ownerEmail) !== '' ? trim($ownerEmail) : self::DEFAULT_OWNER_EMAIL;

        /** @var User $user */
        $user = User::query()->firstOrCreate(
            ['email' => $email],
            [
                'name' => 'E2E Reconciliation User',
                'password' => Hash::make('password'),
                'user_role' => 'user',
                'email_verified_at' => now(),
            ],
        );

        if (! $user->canLogin()) {
            $user->forceFill(['user_role' => 'user'])->save();
        }

        return $user;
    }

    private function account(User $user): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            /** @var FinAccounts $account */
            $account = FinAccounts::withoutGlobalScopes()->updateOrCreate(
                [
                    'acct_owner' => $user->id,
                    'acct_name' => self::ACCOUNT_NAME,
                    'acct_number' => self::ACCOUNT_NUMBER,
                ],
                ['acct_last_balance' => '0'],
            );

            return $account;
        });
    }

    private function makeBrokerDocument(User $user, FinAccounts $account, int $taxYear): FileForTaxDocument
    {
        $filename = 'e2e-recon-drift-1099.pdf';
        $attributes = [
            'user_id' => (int) $user->id,
            'tax_year' => $taxYear,
            'form_type' => 'broker_1099',
            'original_filename' => $filename,
            'stored_filename' => $filename,
            's3_path' => "tax_docs/{$user->id}/{$filename}",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', "recon-drift-fixture:{$user->email}:{$taxYear}"),
            'uploaded_by_user_id' => (int) $user->id,
            'is_reviewed' => true,
            'parsed_data_needs_review' => false,
            'parsed_data_warnings' => [],
            'parsed_data' => [[
                'account_identifier' => self::ACCOUNT_NUMBER,
                'account_name' => self::ACCOUNT_NAME,
                'form_type' => '1099_b',
                'tax_year' => $taxYear,
                'parsed_data' => [
                    'payer_name' => self::ACCOUNT_NAME,
                    'total_proceeds' => 1250,
                    'total_cost_basis' => 1000,
                    'total_realized_gain_loss' => 250,
                    'transactions' => [[
                        'symbol' => self::SYMBOL,
                        'description' => 'E2E reconciliation fixture lot',
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
        ];

        $document = $this->documentIngestionService->createTaxFormDetail($attributes);
        $document->forceFill($attributes)->save();
        $this->documentIngestionService->syncFromTaxDocument($document);

        return $document;
    }

    private function clearFixtureRows(int $documentId, FinAccounts $account): void
    {
        FinLotReconciliationLink::query()
            ->where('document_id', $documentId)
            ->delete();

        FinAccountLot::query()
            ->where('document_id', $documentId)
            ->delete();

        FinAccountLot::query()
            ->where('acct_id', $account->acct_id)
            ->where('symbol', self::SYMBOL)
            ->where('source', FinAccountLot::SOURCE_ACCOUNT_DERIVED)
            ->delete();

        TaxDocumentAccount::query()
            ->where('document_id', $documentId)
            ->delete();
    }

    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document): FinAccountLot
    {
        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => self::SYMBOL,
            'description' => 'E2E reconciliation fixture lot',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 900,
            'cost_per_unit' => 90,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 350,
            'is_short_term' => false,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
            'document_id' => $document->document_id,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ]);
    }

    private function makeAccountLot(FinAccounts $account): FinAccountLot
    {
        return FinAccountLot::create([
            'acct_id' => $account->acct_id,
            'symbol' => self::SYMBOL,
            'description' => 'E2E reconciliation account lot',
            'quantity' => 10,
            'purchase_date' => '2024-01-02',
            'cost_basis' => 1200,
            'cost_per_unit' => 120,
            'sale_date' => '2025-02-03',
            'proceeds' => 1250,
            'realized_gain_loss' => 50,
            'is_short_term' => false,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ]);
    }
}
