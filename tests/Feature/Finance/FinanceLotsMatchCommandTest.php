<?php

namespace Tests\Feature\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\User;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class FinanceLotsMatchCommandTest extends TestCase
{
    public function test_lots_match_command_outputs_single_document_table(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);

        $this->artisan('finance:lots-match', ['--tax-document' => $document->id])
            ->assertExitCode(0)
            ->expectsOutputToContain('Doc ID');

        $this->assertSame(1, FinLotReconciliationLink::query()->count());
    }

    public function test_lots_match_dry_run_does_not_write_links(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);

        $this->artisan('finance:lots-match', [
            '--tax-document' => $document->id,
            '--dry-run' => true,
        ])
            ->assertExitCode(0)
            ->expectsOutputToContain('Dry-run mode');

        $this->assertSame(0, FinLotReconciliationLink::query()->count());
    }

    public function test_lots_match_dry_run_honors_preserve_decisions(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $service = app(LotMatcherService::class);
        $service->runMatcherForDocument((int) $document->id);
        $link = FinLotReconciliationLink::query()->firstOrFail();
        $service->acceptBrokerLink((int) $link->id, $this->createUser()->id);

        $exitCode = Artisan::call('finance:lots-match', [
            '--tax-document' => $document->id,
            '--dry-run' => true,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertSame(0, $payload['totals'][FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame([], $payload['results'][0]['proposals']);
    }

    public function test_lots_match_all_broker_docs_walks_user_year(): void
    {
        [$document, $account, $userId] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        [$secondDocument, $secondAccount] = $this->documentAndAccount($userId);
        $this->makeBrokerLot($secondAccount, $secondDocument, ['symbol' => 'MSFT']);
        $this->makeAccountLot($secondAccount, ['symbol' => 'MSFT']);

        $this->artisan('finance:lots-match', [
            '--user' => $userId,
            '--year' => 2025,
            '--all-broker-docs' => true,
        ])->assertExitCode(0);

        $this->assertSame(2, FinLotReconciliationLink::query()->count());
    }

    public function test_lots_match_json_output_shape(): void
    {
        [$document, $account] = $this->documentAndAccount();
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);

        $exitCode = Artisan::call('finance:lots-match', [
            '--tax-document' => $document->id,
            '--format' => 'json',
        ]);
        $payload = json_decode(Artisan::output(), true);

        $this->assertSame(0, $exitCode);
        $this->assertSame(false, $payload['dryRun']);
        $this->assertSame(true, $payload['preserveDecisions']);
        $this->assertSame(1, $payload['documentCount']);
        $this->assertSame(1, $payload['totals'][FinLotReconciliationLink::STATE_AUTO_MATCHED]);
        $this->assertSame($document->id, $payload['results'][0]['taxDocumentId']);
    }

    /**
     * @return array{FileForTaxDocument, FinAccounts, int}
     */
    private function documentAndAccount(?int $userId = null): array
    {
        $user = $userId !== null ? User::query()->findOrFail($userId) : $this->createUser();
        $account = FinAccounts::withoutEvents(function () use ($user): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => fake()->unique()->company(),
                'acct_number' => fake()->unique()->numerify('####'),
                'acct_last_balance' => '0',
            ]);
        });
        $document = FileForTaxDocument::create([
            'user_id' => $user->id,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => fake()->unique()->slug().'.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => "tax_docs/{$user->id}/".fake()->uuid().'.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
            'is_reviewed' => true,
        ]);

        return [$document, $account, (int) $user->id];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'tax_document_id' => $document->id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeAccountLot(FinAccounts $account, array $overrides = []): FinAccountLot
    {
        return $this->makeLot($account, array_merge([
            'tax_document_id' => null,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ], $overrides));
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    private function makeLot(FinAccounts $account, array $overrides = []): FinAccountLot
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
            'form_8949_box' => 'D',
            'wash_sale_disallowed' => 0,
        ], $overrides));
    }
}
