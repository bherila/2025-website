<?php

namespace Tests\Feature\Finance;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotMatcherAutoDispatchService;
use App\Services\Finance\CapitalGains\LotMatcherService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Tests\TestCase;

class LotMatcherAutoDispatchServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_dispatch_for_account_years_queues_standalone_and_consolidated_documents_once(): void
    {
        Queue::fake();
        Log::spy();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $standalone = $this->makeTaxDocument($user->id, '1099_b', accountId: (int) $account->acct_id);
        $consolidated = $this->makeTaxDocument($user->id, 'broker_1099');
        TaxDocumentAccount::createLink((int) $consolidated->id, (int) $account->acct_id, '1099_b', 2025);

        $queued = app(LotMatcherAutoDispatchService::class)->dispatchForAccountYears(
            userId: $user->id,
            accountId: (int) $account->acct_id,
            taxYears: [2025, 2025],
            trigger: LotMatcherAutoTrigger::CsvImport,
        );

        $this->assertSame(2, $queued);
        Queue::assertPushed(LotsMatchJob::class, 2);
        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => in_array($job->taxDocumentId, [(int) $standalone->id, (int) $consolidated->id], true)
                && $job->delay instanceof \DateTimeInterface,
        );
        Log::shouldHaveReceived('info')
            ->with('Lot matcher auto-dispatch queued', Mockery::on(
                fn (array $context): bool => $context['trigger'] === LotMatcherAutoTrigger::CsvImport->value
                    && $context['account_id'] === (int) $account->acct_id
                    && $context['tax_year'] === 2025,
            ))
            ->twice();
    }

    public function test_duplicate_tax_document_dispatch_uses_unique_job_lock(): void
    {
        Cache::flush();
        Queue::fake();
        $user = $this->createUser();
        $document = $this->makeTaxDocument($user->id, '1099_b');

        $service = app(LotMatcherAutoDispatchService::class);
        $service->dispatchForTaxDocument((int) $document->id, LotMatcherAutoTrigger::ParsedDataRebuild);
        $service->dispatchForTaxDocument((int) $document->id, LotMatcherAutoTrigger::ParsedDataRebuild);

        Queue::assertPushed(LotsMatchJob::class, 1);
    }

    public function test_dispatch_for_account_years_includes_adjacent_tax_year_documents(): void
    {
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $nextYearDocument = $this->makeTaxDocument($user->id, '1099_b', accountId: (int) $account->acct_id);

        $queued = app(LotMatcherAutoDispatchService::class)->dispatchForAccountYears(
            userId: $user->id,
            accountId: (int) $account->acct_id,
            taxYears: [2024],
            trigger: LotMatcherAutoTrigger::ManualLotUpdate,
        );

        $this->assertSame(1, $queued);
        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => $job->taxDocumentId === (int) $nextYearDocument->id,
        );
    }

    public function test_job_properties_and_handler_are_pinned(): void
    {
        $job = new LotsMatchJob(42);
        $matcher = Mockery::mock(LotMatcherService::class);
        $matcher->shouldReceive('runMatcherForDocument')->once()->with(42, true);

        $job->handle($matcher);

        $this->assertSame('42', $job->uniqueId());
        $this->assertSame(300, $job->uniqueFor);
        $this->assertSame(300, $job->timeout);
        $this->assertSame(3, $job->tries);
        $this->assertSame([30, 120], $job->backoff);
    }

    private function makeAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => fake()->unique()->company(),
                'acct_number' => fake()->unique()->numerify('####'),
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeTaxDocument(int $userId, string $formType, ?int $accountId = null): FileForTaxDocument
    {
        return FileForTaxDocument::create([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => $formType,
            'account_id' => $accountId,
            'original_filename' => "{$formType}.pdf",
            'stored_filename' => "{$formType}.pdf",
            's3_path' => "tax_docs/{$userId}/{$formType}.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);
    }
}
