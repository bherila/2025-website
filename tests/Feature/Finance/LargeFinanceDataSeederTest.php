<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use Database\Seeders\Finance\LargeFinanceDataSeeder;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class LargeFinanceDataSeederTest extends TestCase
{
    public function test_large_finance_data_seeder_creates_performance_fixture_edges(): void
    {
        $this->seed(LargeFinanceDataSeeder::class);

        $userId = DB::table('users')
            ->where('email', 'large-data@example.com')
            ->value('id');
        $this->assertNotNull($userId);

        $accountIds = DB::table('fin_accounts')
            ->where('acct_owner', $userId)
            ->pluck('acct_id')
            ->all();
        $documentIds = DB::table('fin_documents')
            ->where('user_id', $userId)
            ->pluck('id')
            ->all();

        $this->assertCount(3, $accountIds);
        $this->assertGreaterThanOrEqual(1100, count($documentIds));
        $this->assertGreaterThanOrEqual(
            10000,
            DB::table('fin_account_lots')->whereIn('acct_id', $accountIds)->count(),
        );

        $missingAccountDocumentCount = DB::table('fin_documents')
            ->whereIn('id', $documentIds)
            ->whereNotExists(function ($query): void {
                $query->selectRaw('1')
                    ->from('fin_document_accounts')
                    ->whereColumn('fin_document_accounts.document_id', 'fin_documents.id');
            })
            ->count();
        $this->assertGreaterThan(0, $missingAccountDocumentCount);

        $multiAccountDocumentIds = DB::table('fin_document_accounts')
            ->select('document_id')
            ->whereIn('document_id', $documentIds)
            ->groupBy('document_id')
            ->havingRaw('COUNT(DISTINCT account_id) > 1')
            ->pluck('document_id')
            ->all();
        $this->assertNotEmpty($multiAccountDocumentIds);

        $sourceCounts = DB::table('fin_account_lots')
            ->whereIn('acct_id', $accountIds)
            ->select('source', DB::raw('COUNT(*) as aggregate'))
            ->groupBy('source')
            ->pluck('aggregate', 'source');
        $this->assertGreaterThan(0, (int) ($sourceCounts[FinAccountLot::SOURCE_BROKER_1099B] ?? 0));
        $this->assertGreaterThan(0, (int) ($sourceCounts[FinAccountLot::SOURCE_ACCOUNT_DERIVED] ?? 0));
        $this->assertGreaterThan(0, (int) ($sourceCounts[FinAccountLot::SOURCE_SYNTHETIC_ADJUSTMENT] ?? 0));
    }
}
