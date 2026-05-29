<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class SeedReconDriftFixtureCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_seed_recon_drift_fixture_is_idempotent(): void
    {
        $first = $this->seedFixture();
        $firstCounts = $this->fixtureCounts();

        $second = $this->seedFixture();
        $secondCounts = $this->fixtureCounts();

        $this->assertSame($first['user_id'], $second['user_id']);
        $this->assertSame($first['tax_document_id'], $second['tax_document_id']);
        $this->assertSame($firstCounts, $secondCounts);
        $this->assertSame([
            'users' => 1,
            'accounts' => 1,
            'tax_documents' => 1,
            'account_links' => 1,
            'lots' => 2,
            'links' => 1,
        ], $secondCounts);
    }

    public function test_seed_recon_drift_fixture_produces_drift_status(): void
    {
        $payload = $this->seedFixture();
        $user = User::query()->findOrFail($payload['user_id']);

        $this->actingAs($user)
            ->getJson('/api/finance/tax-years/2025/lot-reconciliation')
            ->assertOk()
            ->assertJsonPath('summary.dashboard_status', 'drift')
            ->assertJsonPath('documents.0.tax_document_id', $payload['tax_document_id'])
            ->assertJsonPath('documents.0.dashboard_status', 'drift')
            ->assertJsonPath('documents.0.link_state_counts.needs_review', 1);
    }

    /**
     * @return array{user_id: int, tax_year: int, tax_document_id: int, account_id: int, login_path: string, reconciliation_path: string}
     */
    private function seedFixture(): array
    {
        $exitCode = Artisan::call('finance:seed-recon-drift-fixture', [
            '--tax-year' => 2025,
            '--owner-email' => 'e2e-recon@example.test',
            '--quiet-json' => true,
        ]);

        $this->assertSame(0, $exitCode);

        $payload = json_decode(trim(Artisan::output()), true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($payload)) {
            $this->fail('Expected fixture command to emit a JSON object.');
        }

        return [
            'user_id' => (int) $payload['user_id'],
            'tax_year' => (int) $payload['tax_year'],
            'tax_document_id' => (int) $payload['tax_document_id'],
            'account_id' => (int) $payload['account_id'],
            'login_path' => (string) $payload['login_path'],
            'reconciliation_path' => (string) $payload['reconciliation_path'],
        ];
    }

    /**
     * @return array{users: int, accounts: int, tax_documents: int, account_links: int, lots: int, links: int}
     */
    private function fixtureCounts(): array
    {
        return [
            'users' => User::query()->count(),
            'accounts' => FinAccounts::withoutGlobalScopes()->count(),
            'tax_documents' => FileForTaxDocument::query()->count(),
            'account_links' => TaxDocumentAccount::query()->count(),
            'lots' => FinAccountLot::query()->count(),
            'links' => FinLotReconciliationLink::query()->count(),
        ];
    }
}
