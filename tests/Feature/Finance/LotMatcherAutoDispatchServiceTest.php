<?php

namespace Tests\Feature\Finance;

use App\Enums\Finance\LotMatcherAutoTrigger;
use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotMatcherAutoDispatchService;
use App\Services\Finance\CapitalGains\LotMatcherResult;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\LotMatchRunRecorder;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\LotMatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Psr\Log\AbstractLogger;
use Tests\TestCase;

class LotMatcherAutoDispatchServiceTest extends TestCase
{
    use RefreshDatabase;

    public function test_dispatch_for_account_years_queues_standalone_and_consolidated_documents_once(): void
    {
        Queue::fake();
        $logger = $this->swapLogRecorder();
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
            fn (LotsMatchJob $job): bool => in_array($job->documentId, [(int) $standalone->document_id, (int) $consolidated->document_id], true)
                && $job->delay instanceof \DateTimeInterface,
        );
        $queuedRecords = array_values(array_filter(
            $logger->records,
            fn (array $record): bool => $record['level'] === 'info'
                && $record['message'] === 'Lot matcher auto-dispatch queued'
                && $record['context']['trigger'] === LotMatcherAutoTrigger::CsvImport->value
                && $record['context']['account_id'] === (int) $account->acct_id
                && $record['context']['tax_year'] === 2025,
        ));
        $this->assertCount(2, $queuedRecords);
    }

    public function test_duplicate_tax_document_dispatch_uses_unique_job_lock(): void
    {
        Cache::flush();
        Queue::fake();
        $user = $this->createUser();
        $document = $this->makeTaxDocument($user->id, '1099_b');

        $service = app(LotMatcherAutoDispatchService::class);
        $service->dispatchForDocument((int) $document->document_id, LotMatcherAutoTrigger::ParsedDataRebuild);
        $service->dispatchForDocument((int) $document->document_id, LotMatcherAutoTrigger::ParsedDataRebuild);

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
            fn (LotsMatchJob $job): bool => $job->documentId === (int) $nextYearDocument->document_id,
        );
    }

    public function test_dispatch_for_account_years_includes_statement_disposition_documents_without_tax_year(): void
    {
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = FinDocument::query()->create([
            'user_id' => $user->id,
            'document_kind' => FinDocument::KIND_STATEMENT,
            'period_start' => '2025-01-01',
            'period_end' => '2025-01-31',
            'original_filename' => 'statement.pdf',
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $user->id,
        ]);

        FinAccountLot::query()->create([
            'acct_id' => $account->acct_id,
            'document_id' => $document->id,
            'symbol' => 'AAPL',
            'description' => 'Apple Inc.',
            'quantity' => 1,
            'purchase_date' => '2024-01-01',
            'cost_basis' => 100,
            'cost_per_unit' => 100,
            'sale_date' => '2025-01-15',
            'proceeds' => 125,
            'realized_gain_loss' => 25,
            'is_short_term' => false,
            'lot_source' => 'import',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
            'lot_origin' => FinAccountLot::ORIGIN_STATEMENT_DISPOSITION,
        ]);

        $queued = app(LotMatcherAutoDispatchService::class)->dispatchForAccountYears(
            userId: $user->id,
            accountId: (int) $account->acct_id,
            taxYears: [2025],
            trigger: LotMatcherAutoTrigger::ManualLotUpdate,
        );

        $this->assertSame(1, $queued);
        Queue::assertPushed(
            LotsMatchJob::class,
            fn (LotsMatchJob $job): bool => $job->documentId === (int) $document->id
                && $job->taxYear === 2025,
        );
    }

    public function test_job_properties_and_handler_are_pinned(): void
    {
        $logger = $this->swapLogRecorder();
        $job = new LotsMatchJob(42, queuedAtIso: now()->subSeconds(5)->toIso8601String());
        $matcher = new class extends LotMatcherService
        {
            /**
             * @var list<array{document_id: int, preserve_decisions: bool}>
             */
            public array $calls = [];

            public function __construct()
            {
                parent::__construct(app(LotMatcher::class));
            }

            public function runMatcherForDocument(int $documentId, bool $preserveDecisions = true): LotMatcherResult
            {
                $this->calls[] = [
                    'document_id' => $documentId,
                    'preserve_decisions' => $preserveDecisions,
                ];

                return new LotMatcherResult($documentId, false, [], [], []);
            }
        };

        $job->handle($matcher, app(LotMatchRunRecorder::class));

        $this->assertSame([['document_id' => 42, 'preserve_decisions' => true]], $matcher->calls);
        $this->assertSame('42', $job->uniqueId());
        $this->assertSame(300, $job->uniqueFor);
        $this->assertSame(300, $job->timeout);
        $this->assertSame(3, $job->tries);
        $this->assertSame([30, 120], $job->backoff);
        $timingRecords = array_values(array_filter(
            $logger->records,
            fn (array $record): bool => $record['level'] === 'info'
                && $record['message'] === 'LotsMatchJob: matcher timing'
                && $record['context']['document_id'] === 42
                && $record['context']['tax_year'] === null
                && $record['context']['queue_wait_ms'] >= 0
                && $record['context']['duration_ms'] >= 0
                && $record['context']['success'] === true,
        ));
        $this->assertCount(1, $timingRecords);
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
        return app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => $formType,
            'account_id' => $accountId,
            'original_filename' => "{$formType}.pdf",
            'stored_filename' => "{$formType}.pdf",
            's3_path' => "tax_docs/{$userId}/{$formType}.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', "{$userId}|{$formType}|{$accountId}"),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);
    }

    /**
     * @return object{records: list<array{level: string, message: string, context: array<string, mixed>}>}
     */
    private function swapLogRecorder(): object
    {
        $logger = new class extends AbstractLogger
        {
            /**
             * @var list<array{level: string, message: string, context: array<string, mixed>}>
             */
            public array $records = [];

            /**
             * @param  array<string, mixed>  $context
             */
            public function log($level, string|\Stringable $message, array $context = []): void
            {
                $this->records[] = [
                    'level' => (string) $level,
                    'message' => (string) $message,
                    'context' => $context,
                ];
            }
        };

        Log::swap($logger);

        return $logger;
    }
}
