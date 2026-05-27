<?php

namespace Database\Seeders\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use App\Services\Finance\DocumentIngestionService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * LargeFinanceDataSeeder
 *
 * Seeds a realistic, high-volume finance dataset for performance testing and
 * N+1 detection.  Creates:
 *
 *   - 3 broker accounts per user (multi-account fixture)
 *   - ≥ 1 000 FinDocument / FileForTaxDocument records spread across 10 tax years
 *   - ≥ 10 000 FinAccountLot rows (broker + account-derived + synthetic adjustments)
 *   - Account links with ai_identifier so the normaliser can match them
 *   - A handful of "missing account" documents (no TaxDocumentAccount link)
 *
 * Usage (local / CI only):
 *
 *   php artisan db:seed --class="Database\\Seeders\\Finance\\LargeFinanceDataSeeder"
 *
 * The seeder refuses to run in production unless --force is passed.
 */
class LargeFinanceDataSeeder extends Seeder
{
    /** Number of 1099-B tax documents to create per user. */
    private const DOCUMENTS_PER_USER = 1_100;

    /** Number of broker lot rows to create per account. */
    private const LOTS_PER_ACCOUNT = 3_500;

    /** Number of broker accounts to create per user. */
    private const ACCOUNTS_PER_USER = 3;

    /** Tax years to distribute documents across. */
    private const TAX_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

    /** Symbols used to generate lot data. */
    private const SYMBOLS = ['AAPL', 'MSFT', 'GOOG', 'AMZN', 'TSLA', 'NVDA', 'META', 'BRK.B', 'V', 'MA'];

    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }

        $user = $this->resolveOrCreateUser();
        $accounts = $this->seedAccounts($user);
        $this->seedDocumentsAndLots($user, $accounts);
    }

    private function resolveOrCreateUser(): User
    {
        return User::query()->firstOrCreate(
            ['email' => 'large-data@example.com'],
            [
                'name' => 'Large Data Test User',
                'password' => bcrypt('secret'),
                'user_role' => 'user',
            ],
        );
    }

    /**
     * @return list<FinAccounts>
     */
    private function seedAccounts(User $user): array
    {
        $brokers = ['Alpha Brokerage', 'Beta Securities', 'Gamma Invest'];
        $accounts = [];

        foreach (array_slice($brokers, 0, self::ACCOUNTS_PER_USER) as $i => $name) {
            $account = FinAccounts::withoutEvents(function () use ($user, $name, $i): FinAccounts {
                return FinAccounts::withoutGlobalScopes()->firstOrCreate(
                    ['acct_owner' => $user->id, 'acct_name' => $name],
                    [
                        'acct_number' => (string) (9000000 + $i),
                        'acct_last_balance' => 0,
                        'acct_is_debt' => false,
                        'acct_is_retirement' => false,
                        'acct_sort_order' => $i + 1,
                    ],
                );
            });

            $accounts[] = $account;
        }

        return $accounts;
    }

    /**
     * @param  list<FinAccounts>  $accounts
     */
    private function seedDocumentsAndLots(User $user, array $accounts): void
    {
        $ingestionService = app(DocumentIngestionService::class);
        $docsPerAccount = (int) ceil(self::DOCUMENTS_PER_USER / count($accounts));

        foreach ($accounts as $account) {
            for ($d = 0; $d < $docsPerAccount; $d++) {
                $taxYear = self::TAX_YEARS[$d % count(self::TAX_YEARS)];
                $identifier = "ACCT-{$account->acct_id}-{$taxYear}-{$d}";
                $filename = "large-{$account->acct_id}-{$d}.pdf";
                $isMissingAccount = $d % 10 === 0;
                $isMultiAccountDocument = ! $isMissingAccount && $d % 25 === 1;

                $document = $ingestionService->createTaxFormDetail([
                    'user_id' => $user->id,
                    'tax_year' => $taxYear,
                    'form_type' => 'broker_1099',
                    'original_filename' => $filename,
                    'stored_filename' => $filename,
                    's3_path' => "tax_docs/{$user->id}/{$filename}",
                    'mime_type' => 'application/pdf',
                    'file_size_bytes' => 1024,
                    'file_hash' => hash('sha256', $identifier),
                    'uploaded_by_user_id' => $user->id,
                    'is_reviewed' => ($d % 5 !== 0), // ~20 % unreviewed
                    'parsed_data' => $isMultiAccountDocument
                        ? $this->buildParsedDataForAccounts($accounts, $taxYear, $d)
                        : $this->buildParsedData($identifier, $taxYear),
                ]);

                if ($isMissingAccount) {
                    continue;
                }

                if ($isMultiAccountDocument) {
                    foreach ($accounts as $linkedAccount) {
                        TaxDocumentAccount::createLink(
                            (int) $document->id,
                            $linkedAccount->acct_id,
                            '1099_b',
                            $taxYear,
                            aiIdentifier: "ACCT-{$linkedAccount->acct_id}-{$taxYear}-{$d}",
                            aiAccountName: $linkedAccount->acct_name,
                        );
                    }

                    continue;
                }

                TaxDocumentAccount::createLink(
                    (int) $document->id,
                    $account->acct_id,
                    '1099_b',
                    $taxYear,
                    aiIdentifier: $identifier,
                    aiAccountName: $account->acct_name,
                );
            }

            // Bulk-insert lots after all documents for this account are created.
            $this->seedLotsForAccount($account);
        }
    }

    /**
     * Bulk-inserts LOTS_PER_ACCOUNT lots for the given account.
     * Distributes across broker, account-derived, and synthetic-adjustment sources.
     */
    private function seedLotsForAccount(FinAccounts $account): void
    {
        $now = now()->toDateTimeString();
        $rows = [];
        $chunkSize = 500;

        for ($i = 0; $i < self::LOTS_PER_ACCOUNT; $i++) {
            $symbol = self::SYMBOLS[$i % count(self::SYMBOLS)];
            $purchaseYear = 2018 + ($i % 8);
            $saleYear = $purchaseYear + 1 + ($i % 3);
            $isShortTerm = ($saleYear - $purchaseYear) <= 1;
            $source = match ($i % 4) {
                0 => FinAccountLot::SOURCE_BROKER_1099B,
                1 => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
                2 => FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT,
                default => FinAccountLot::SOURCE_MANUAL,
            };
            $quantity = round(1 + ($i % 100) * 0.5, 2);
            $costBasis = round($quantity * (50 + ($i % 200)), 2);
            $proceeds = round($costBasis * (0.8 + fmod((float) $i, 100.0) / 200.0), 2);

            $rows[] = [
                'acct_id' => $account->acct_id,
                'symbol' => $symbol,
                'description' => $symbol.' Corporation',
                'quantity' => $quantity,
                'purchase_date' => "{$purchaseYear}-01-".str_pad((string) (($i % 28) + 1), 2, '0', STR_PAD_LEFT),
                'cost_basis' => $costBasis,
                'cost_per_unit' => round($costBasis / $quantity, 4),
                'sale_date' => "{$saleYear}-06-".str_pad((string) (($i % 28) + 1), 2, '0', STR_PAD_LEFT),
                'proceeds' => $proceeds,
                'realized_gain_loss' => round($proceeds - $costBasis, 4),
                'is_short_term' => $isShortTerm ? 1 : 0,
                'lot_source' => $source === FinAccountLot::SOURCE_BROKER_1099B ? '1099b' : 'analyzer',
                'source' => $source,
                'lot_origin' => $source === FinAccountLot::SOURCE_BROKER_1099B
                                            ? FinAccountLot::ORIGIN_1099B_DISPOSITION
                                            : FinAccountLot::ORIGIN_STATEMENT_POSITION,
                'form_8949_box' => $isShortTerm ? 'A' : 'D',
                'is_covered' => 1,
                'wash_sale_disallowed' => 0,
                'created_at' => $now,
                'updated_at' => $now,
            ];

            if (count($rows) >= $chunkSize) {
                DB::table('fin_account_lots')->insert($rows);
                $rows = [];
            }
        }

        if ($rows !== []) {
            DB::table('fin_account_lots')->insert($rows);
        }
    }

    /**
     * Build minimal parsed_data for a 1099-B document.
     *
     * @return list<array<string, mixed>>
     */
    private function buildParsedData(string $identifier, int $taxYear): array
    {
        return [[
            'account_identifier' => $identifier,
            'account_name' => 'Synthetic Account',
            'form_type' => '1099_b',
            'tax_year' => $taxYear,
            'parsed_data' => [
                'payer_name' => 'Synthetic Broker',
                'total_proceeds' => 50000,
                'total_cost_basis' => 40000,
                'total_realized_gain_loss' => 10000,
                'transactions' => $this->buildTransactions(),
            ],
        ]];
    }

    /**
     * @param  list<FinAccounts>  $accounts
     * @return list<array<string, mixed>>
     */
    private function buildParsedDataForAccounts(array $accounts, int $taxYear, int $documentIndex): array
    {
        return array_map(
            fn (FinAccounts $account): array => [
                'account_identifier' => "ACCT-{$account->acct_id}-{$taxYear}-{$documentIndex}",
                'account_name' => $account->acct_name,
                'form_type' => '1099_b',
                'tax_year' => $taxYear,
                'parsed_data' => [
                    'payer_name' => 'Synthetic Broker',
                    'total_proceeds' => 50000,
                    'total_cost_basis' => 40000,
                    'total_realized_gain_loss' => 10000,
                    'transactions' => $this->buildTransactions(),
                ],
            ],
            $accounts,
        );
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function buildTransactions(): array
    {
        $txns = [];

        foreach (self::SYMBOLS as $idx => $symbol) {
            $txns[] = [
                'symbol' => $symbol,
                'description' => $symbol.' Corporation',
                'quantity' => 10 + $idx,
                'purchase_date' => '2024-01-02',
                'sale_date' => '2025-02-03',
                'proceeds' => 5000 + ($idx * 100),
                'cost_basis' => 4000 + ($idx * 80),
                'wash_sale_disallowed' => 0,
                'realized_gain_loss' => 1000 + ($idx * 20),
                'form_8949_box' => 'D',
                'is_covered' => true,
                'is_short_term' => false,
                'is_long_term' => true,
            ];
        }

        return $txns;
    }
}
