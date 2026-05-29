<?php

namespace Tests\Feature\Finance;

use App\Jobs\DispatchQueuedLotsMatchRunJob;
use App\Jobs\LotsMatchJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinLotReconciliationLink;
use App\Models\FinanceTool\LotMatchRun;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\CapitalGains\LotMatcherResult;
use App\Services\Finance\CapitalGains\LotMatcherService;
use App\Services\Finance\CapitalGains\LotMatchRunRecorder;
use App\Services\Finance\DocumentIngestionService;
use App\Services\Finance\LotMatcher;
use Illuminate\Bus\UniqueLock;
use Illuminate\Contracts\Bus\Dispatcher;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Queue\Jobs\FakeJob;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class LotsMatchJobTest extends TestCase
{
    public function test_job_marks_run_succeeded(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $run->id);
        $job->handle(app(LotMatcherService::class), app(LotMatchRunRecorder::class));

        $run->refresh();
        $this->assertSame(LotMatchRun::STATUS_SUCCEEDED, $run->status);
        $this->assertNotNull($run->started_at);
        $this->assertNotNull($run->finished_at);
        $this->assertSame(1, $run->result_summary['counts'][FinLotReconciliationLink::STATE_AUTO_MATCHED]);
    }

    public function test_job_marks_run_failed(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $this->expectException(ModelNotFoundException::class);

        try {
            $job = new LotsMatchJob(999999, 2025, null, (int) $run->id);
            $this->setJobAttempts($job, $job->tries);
            $job->handle(app(LotMatcherService::class), app(LotMatchRunRecorder::class));
        } finally {
            $run->refresh();
            $this->assertSame(LotMatchRun::STATUS_FAILED, $run->status);
            $this->assertNotNull($run->error);
        }
    }

    public function test_permanent_failure_dispatches_latest_coalesced_queued_run(): void
    {
        Cache::flush();
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_RUNNING,
            'mode' => LotMatchRun::MODE_PRESERVE,
            'started_at' => now(),
        ]);
        $coalescedRun = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $run->id);
        try {
            $job->failed(new \RuntimeException('Matcher failed permanently.'));

            $this->assertSame(LotMatchRun::STATUS_FAILED, $run->fresh()->status);
            Queue::assertPushed(
                LotsMatchJob::class,
                fn (LotsMatchJob $queuedJob): bool => $queuedJob->documentId === (int) $document->document_id
                    && $queuedJob->taxYear === 2025
                    && $queuedJob->runId === (int) $coalescedRun->id
                    && $queuedJob->mode === LotMatchRun::MODE_PRESERVE,
            );
        } finally {
            Cache::flush();
        }
    }

    public function test_follow_up_dispatcher_dispatches_latest_queued_run_when_matcher_lock_is_available(): void
    {
        Cache::flush();
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $job = new DispatchQueuedLotsMatchRunJob((int) $document->document_id, 2025);
        try {
            $job->handle(app(LotMatchRunRecorder::class), app(CacheRepository::class), app(Dispatcher::class));

            Queue::assertPushed(
                LotsMatchJob::class,
                fn (LotsMatchJob $queuedJob): bool => $queuedJob->documentId === (int) $document->document_id
                    && $queuedJob->taxYear === 2025
                    && $queuedJob->runId === (int) $run->id
                    && $queuedJob->mode === LotMatchRun::MODE_PRESERVE,
            );
        } finally {
            Cache::flush();
        }
    }

    public function test_follow_up_dispatcher_releases_when_matcher_lock_is_still_held(): void
    {
        Cache::flush();
        Queue::fake();
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);
        $lockJob = new LotsMatchJob((int) $document->document_id, 2025);
        $uniqueLock = new UniqueLock(app(CacheRepository::class));
        $this->assertTrue($uniqueLock->acquire($lockJob));

        try {
            $job = new DispatchQueuedLotsMatchRunJob((int) $document->document_id, 2025);
            $job->withFakeQueueInteractions();
            $job->handle(app(LotMatchRunRecorder::class), app(CacheRepository::class), app(Dispatcher::class));

            $job->assertReleased(DispatchQueuedLotsMatchRunJob::RELEASE_AFTER_SECONDS);
            Queue::assertNotPushed(LotsMatchJob::class);
        } finally {
            $uniqueLock->release($lockJob);
        }
    }

    public function test_job_keeps_run_active_after_retryable_failure(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $this->expectException(ModelNotFoundException::class);

        try {
            $job = new LotsMatchJob(999999, 2025, null, (int) $run->id);
            $this->setJobAttempts($job, 1);
            $job->handle(app(LotMatcherService::class), app(LotMatchRunRecorder::class));
        } finally {
            $run->refresh();
            $this->assertSame(LotMatchRun::STATUS_RUNNING, $run->status);
            $this->assertNull($run->error);
        }
    }

    public function test_job_skips_superseded_run(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $staleRun = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_SUPERSEDED,
            'mode' => LotMatchRun::MODE_PRESERVE,
            'finished_at' => now(),
        ]);
        $latestRun = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_SUCCEEDED,
            'mode' => LotMatchRun::MODE_FORCE,
            'started_at' => now(),
            'finished_at' => now(),
        ]);
        $matcher = \Mockery::mock(LotMatcherService::class);
        $matcher->shouldReceive('runMatcherForDocument')->never();

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $staleRun->id);
        $job->handle($matcher, app(LotMatchRunRecorder::class));

        $this->assertSame(LotMatchRun::STATUS_SUPERSEDED, $staleRun->fresh()->status);
        $this->assertSame(LotMatchRun::STATUS_SUCCEEDED, $latestRun->fresh()->status);
    }

    public function test_job_runs_latest_coalesced_queued_run_when_original_was_superseded(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $this->makeBrokerLot($account, $document);
        $this->makeAccountLot($account);
        $staleRun = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_SUPERSEDED,
            'mode' => LotMatchRun::MODE_PRESERVE,
            'finished_at' => now(),
        ]);
        $coalescedRun = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $staleRun->id);
        $job->handle(app(LotMatcherService::class), app(LotMatchRunRecorder::class));

        $staleRun->refresh();
        $coalescedRun->refresh();
        $this->assertSame(LotMatchRun::STATUS_SUPERSEDED, $staleRun->status);
        $this->assertSame(LotMatchRun::STATUS_SUCCEEDED, $coalescedRun->status);
        $this->assertSame(1, $coalescedRun->result_summary['counts'][FinLotReconciliationLink::STATE_AUTO_MATCHED]);
    }

    public function test_job_processes_follow_up_run_when_current_run_is_superseded_during_matcher(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);
        $coalescedRun = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);
        $matcher = new class extends LotMatcherService
        {
            public int $calls = 0;

            public function __construct()
            {
                parent::__construct(app(LotMatcher::class));
            }

            public function runMatcherForDocument(
                int $documentId,
                bool $preserveDecisions = true,
            ): LotMatcherResult {
                $this->calls++;

                return new LotMatcherResult($documentId, false, [], [], []);
            }
        };
        $recorder = new class($coalescedRun) extends LotMatchRunRecorder
        {
            public int $successAttempts = 0;

            public function __construct(
                private readonly LotMatchRun $coalescedRun,
            ) {}

            public function runningIfLatestActive(LotMatchRun $run): ?LotMatchRun
            {
                $run->forceFill([
                    'status' => LotMatchRun::STATUS_RUNNING,
                    'started_at' => $run->started_at ?? now(),
                    'finished_at' => null,
                    'error' => null,
                ])->save();

                return $run->refresh();
            }

            public function latestActiveForUpdate(LotMatchRun $run): ?LotMatchRun
            {
                return $run->fresh();
            }

            public function succeededIfLatestActive(LotMatchRun $run, LotMatcherResult $result, ?int $taxYear = null): ?LotMatchRun
            {
                $this->successAttempts++;
                if ($this->successAttempts === 1) {
                    return null;
                }

                return $this->succeeded($run, $result, $taxYear);
            }

            public function latestQueuedPreserveForDocument(int $documentId): ?LotMatchRun
            {
                return $this->coalescedRun->fresh();
            }
        };

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $run->id);
        $job->handle($matcher, $recorder);

        $this->assertSame(2, $matcher->calls);
        $this->assertSame(2, $recorder->successAttempts);
        $this->assertSame(LotMatchRun::STATUS_SUCCEEDED, $coalescedRun->fresh()->status);
    }

    public function test_job_does_not_record_success_after_run_is_superseded_during_matcher(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_PRESERVE,
        ]);
        $matcher = new class((int) $document->document_id, $user->id) extends LotMatcherService
        {
            public ?int $newerRunId = null;

            public function __construct(
                private readonly int $documentId,
                private readonly int $userId,
            ) {
                parent::__construct(app(LotMatcher::class));
            }

            public function runMatcherForDocument(
                int $documentId,
                bool $preserveDecisions = true,
            ): LotMatcherResult {
                $newerRun = app(LotMatchRunRecorder::class)->queued(
                    documentId: $this->documentId,
                    userId: $this->userId,
                    taxYear: 2025,
                    mode: LotMatchRun::MODE_FORCE,
                );
                $this->newerRunId = (int) $newerRun->id;

                $result = new LotMatcherResult($documentId, false, [], [], []);

                return $result;
            }
        };

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $run->id);
        $job->handle($matcher, app(LotMatchRunRecorder::class));

        $run->refresh();
        $this->assertSame(LotMatchRun::STATUS_RUNNING, $run->status);
        $this->assertNull($run->result_summary);
        $this->assertDatabaseMissing('lot_match_runs', [
            'id' => $matcher->newerRunId,
        ]);
    }

    public function test_force_mode_rebuilds_preserved_decisions(): void
    {
        $user = $this->createUser();
        $account = $this->makeAccount($user->id);
        $document = $this->makeBrokerDocument($user->id, $account);
        $brokerLot = $this->makeBrokerLot($account, $document);
        $accountLot = $this->makeAccountLot($account);
        FinLotReconciliationLink::create([
            'document_id' => $document->document_id,
            'broker_lot_id' => $brokerLot->lot_id,
            'account_lot_id' => $accountLot->lot_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
            'match_reason' => [
                'reason_code' => 'manual',
                'score' => 1.0,
                'deltas' => [
                    'proceeds' => 0,
                    'basis' => 0,
                    'wash' => 0,
                    'qty' => 0,
                    'date_days' => 0,
                ],
                'notes' => null,
            ],
        ]);
        $run = LotMatchRun::create([
            'document_id' => $document->document_id,
            'user_id' => $user->id,
            'status' => LotMatchRun::STATUS_QUEUED,
            'mode' => LotMatchRun::MODE_FORCE,
        ]);

        $job = new LotsMatchJob((int) $document->document_id, 2025, null, (int) $run->id, LotMatchRun::MODE_FORCE);
        $job->handle(app(LotMatcherService::class), app(LotMatchRunRecorder::class));

        $this->assertDatabaseHas('fin_lot_reconciliation_links', [
            'document_id' => $document->document_id,
            'state' => FinLotReconciliationLink::STATE_AUTO_MATCHED,
        ]);
        $this->assertDatabaseMissing('fin_lot_reconciliation_links', [
            'document_id' => $document->document_id,
            'state' => FinLotReconciliationLink::STATE_ACCEPTED_BROKER,
        ]);
    }

    private function makeAccount(int $userId): FinAccounts
    {
        return FinAccounts::withoutEvents(function () use ($userId): FinAccounts {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $userId,
                'acct_name' => 'Brokerage',
                'acct_number' => fake()->numerify('####'),
                'acct_last_balance' => '0',
            ]);
        });
    }

    private function makeBrokerDocument(int $userId, FinAccounts $account): FileForTaxDocument
    {
        $document = app(DocumentIngestionService::class)->createTaxFormDetail([
            'user_id' => $userId,
            'tax_year' => 2025,
            'form_type' => 'broker_1099',
            'original_filename' => 'broker-1099.pdf',
            'stored_filename' => fake()->uuid().'.pdf',
            's3_path' => "tax_docs/{$userId}/broker-1099.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', fake()->uuid()),
            'uploaded_by_user_id' => $userId,
            'is_reviewed' => true,
        ]);

        TaxDocumentAccount::createLink((int) $document->id, $account->acct_id, '1099_b', 2025, aiIdentifier: '1234', aiAccountName: $account->acct_name);

        return $document;
    }

    private function makeBrokerLot(FinAccounts $account, FileForTaxDocument $document): FinAccountLot
    {
        return $this->makeLot($account, [
            'document_id' => $document->document_id,
            'lot_source' => FinAccountLot::SOURCE_1099B,
            'source' => FinAccountLot::SOURCE_BROKER_1099B,
        ]);
    }

    private function makeAccountLot(FinAccounts $account): FinAccountLot
    {
        return $this->makeLot($account, [
            'document_id' => null,
            'lot_source' => 'analyzer',
            'source' => FinAccountLot::SOURCE_ACCOUNT_DERIVED,
        ]);
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

    private function setJobAttempts(LotsMatchJob $job, int $attempts): void
    {
        $job->withFakeQueueInteractions();
        if ($job->job instanceof FakeJob) {
            $job->job->attempts = $attempts;
        }
    }
}
