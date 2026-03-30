<?php

declare(strict_types=1);

namespace QueueMonitor\Tests\Feature;

use Carbon\Carbon;
use Illuminate\Support\Facades\Redis;
use Orchestra\Testbench\TestCase as OrchestraTestCase;
use QueueMonitor\Repositories\RedisQueueMonitorRepository;

class RedisQueueMonitorRepositoryTest extends OrchestraTestCase
{
    protected RedisQueueMonitorRepository $repository;

    protected function setUp(): void
    {
        parent::setUp();

        // Skip tests if Redis is not available
        try {
            Redis::connection('default')->ping();
        } catch (\Exception $e) {
            $this->markTestSkipped('Redis is not available. Skipping Redis tests.');
        }

        $this->repository = new RedisQueueMonitorRepository();

        // Clear Redis before each test
        try {
            $this->repository->clear();
            $this->repository->resetStats();
        } catch (\Exception $e) {
            $this->markTestSkipped('Redis is not available. Skipping Redis tests.');
        }
    }

    protected function tearDown(): void
    {
        // Clean up after tests if Redis is available
        try {
            if (isset($this->repository)) {
                $this->repository->clear();
                $this->repository->resetStats();
            }
        } catch (\Exception $e) {
            // Redis not available, skip cleanup
        }

        parent::tearDown();
    }

    protected function getPackageProviders($app): array
    {
        return [
            \QueueMonitor\QueueMonitorServiceProvider::class,
        ];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('queue-monitor.driver', 'redis');
        $app['config']->set('database.redis.default', [
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', 6379),
            'database' => env('REDIS_DB', 0),
        ]);

        // Also set 'redis' connection (for when auto-detection looks for it)
        $app['config']->set('database.redis.redis', [
            'host' => env('REDIS_HOST', '127.0.0.1'),
            'password' => env('REDIS_PASSWORD'),
            'port' => env('REDIS_PORT', 6379),
            'database' => env('REDIS_DB', 0),
        ]);
    }

    public function test_record_processing(): void
    {
        $data = [
            'job_id' => 'test-job-123',
            'uuid' => '550e8400-e29b-41d4-a716-446655440000',
            'connection' => 'redis',
            'queue' => 'default',
            'name' => 'App\\Jobs\\TestJob',
            'attempts' => 1,
            'payload' => ['data' => 'test'],
            'started_at' => Carbon::now(),
        ];

        $this->repository->recordProcessing($data);

        $jobs = $this->repository->recentJobs(1);

        $this->assertCount(1, $jobs);
        $this->assertEquals('test-job-123', $jobs[0]['job_id']);
        $this->assertEquals('processing', $jobs[0]['status']);

        $stats = $this->repository->dashboardStats();
        $this->assertEquals(1, $stats['total']);
        $this->assertEquals(1, $stats['processing']);
    }

    public function test_record_processed(): void
    {
        // First record processing
        $startTime = Carbon::now();
        $data = [
            'job_id' => 'test-job-456',
            'uuid' => '550e8400-e29b-41d4-a716-446655440001',
            'connection' => 'redis',
            'queue' => 'default',
            'name' => 'App\\Jobs\\TestJob',
            'attempts' => 1,
            'payload' => ['data' => 'test'],
            'started_at' => $startTime,
        ];

        $this->repository->recordProcessing($data);

        // Then record processed
        $finishTime = $startTime->copy()->addSeconds(5);
        $this->repository->recordProcessed('test-job-456', [
            'connection' => 'redis',
            'queue' => 'default',
            'finished_at' => $finishTime,
        ]);

        $jobs = $this->repository->recentJobs(1);

        $this->assertCount(1, $jobs);
        $this->assertEquals('processed', $jobs[0]['status']);
        $this->assertGreaterThan(0, $jobs[0]['runtime_ms']);

        $stats = $this->repository->dashboardStats();
        $this->assertEquals(1, $stats['processed']);
        $this->assertEquals(0, $stats['processing']);
    }

    public function test_record_failed(): void
    {
        // First record processing
        $startTime = Carbon::now();
        $data = [
            'job_id' => 'test-job-789',
            'uuid' => '550e8400-e29b-41d4-a716-446655440002',
            'connection' => 'redis',
            'queue' => 'default',
            'name' => 'App\\Jobs\\TestJob',
            'attempts' => 1,
            'payload' => ['data' => 'test'],
            'started_at' => $startTime,
        ];

        $this->repository->recordProcessing($data);

        // Then record failed
        $finishTime = $startTime->copy()->addSeconds(2);
        $this->repository->recordFailed('test-job-789', [
            'connection' => 'redis',
            'queue' => 'default',
            'finished_at' => $finishTime,
            'exception' => 'Test exception',
        ]);

        $jobs = $this->repository->recentJobs(1);

        $this->assertCount(1, $jobs);
        $this->assertEquals('failed', $jobs[0]['status']);
        $this->assertEquals('Test exception', $jobs[0]['exception']);

        $stats = $this->repository->dashboardStats();
        $this->assertEquals(1, $stats['failed']);
        $this->assertEquals(0, $stats['processing']);
    }

    public function test_recent_jobs(): void
    {
        // Record multiple jobs
        for ($i = 1; $i <= 5; $i++) {
            $data = [
                'job_id' => "job-{$i}",
                'uuid' => "uuid-{$i}",
                'connection' => 'redis',
                'queue' => 'default',
                'name' => 'App\\Jobs\\TestJob',
                'attempts' => 1,
                'payload' => ['index' => $i],
                'started_at' => Carbon::now()->addSeconds($i),
            ];

            $this->repository->recordProcessing($data);
        }

        $jobs = $this->repository->recentJobs(3);

        $this->assertCount(3, $jobs);
        // Most recent first
        $this->assertEquals('job-5', $jobs[0]['job_id']);
        $this->assertEquals('job-4', $jobs[1]['job_id']);
        $this->assertEquals('job-3', $jobs[2]['job_id']);
    }

    public function test_prune(): void
    {
        // Ensure completely clean state for this test
        $this->repository->clear();
        $this->repository->resetStats();

        // Wait a moment to ensure Redis is cleared
        usleep(50000); // 50ms

        // Record an old job with unique ID
        $oldTime = Carbon::now()->subDays(20);
        $data = [
            'job_id' => 'prune-test-old-job-' . time(),
            'uuid' => 'prune-old-uuid-' . time(),
            'connection' => 'redis',
            'queue' => 'prune-test-queue',
            'name' => 'App\\Jobs\\PruneTestJob',
            'attempts' => 1,
            'payload' => ['data' => 'old'],
            'started_at' => $oldTime,
        ];

        $this->repository->recordProcessing($data);

        // Record a recent job with unique ID
        $recentTime = Carbon::now();
        $data2 = [
            'job_id' => 'prune-test-recent-job-' . time(),
            'uuid' => 'prune-recent-uuid-' . time(),
            'connection' => 'redis',
            'queue' => 'prune-test-queue',
            'name' => 'App\\Jobs\\PruneTestJob',
            'attempts' => 1,
            'payload' => ['data' => 'recent'],
            'started_at' => $recentTime,
        ];

        $this->repository->recordProcessing($data2);

        // Verify we have exactly 2 jobs
        $jobsBeforePrune = $this->repository->recentJobs(100);
        $this->assertGreaterThanOrEqual(2, count($jobsBeforePrune), 'Should have at least 2 jobs before pruning');

        // Prune jobs older than 15 days
        $pruned = $this->repository->prune(Carbon::now()->subDays(15));

        $this->assertGreaterThanOrEqual(1, $pruned, 'Should have pruned at least 1 job');

        // Verify the recent job is still there
        $jobsAfterPrune = $this->repository->recentJobs(100);

        // Find our recent job in the results
        $recentJobFound = false;
        foreach ($jobsAfterPrune as $job) {
            if (str_contains($job['job_id'], 'prune-test-recent-job-')) {
                $recentJobFound = true;
                break;
            }
        }

        $this->assertTrue($recentJobFound, 'Recent job should still exist after pruning');

        // Verify old job is gone
        $oldJobFound = false;
        foreach ($jobsAfterPrune as $job) {
            if (str_contains($job['job_id'], 'prune-test-old-job-')) {
                $oldJobFound = true;
                break;
            }
        }

        $this->assertFalse($oldJobFound, 'Old job should be pruned');
    }

    public function test_set_and_get_control(): void
    {
        $this->repository->setControl('redis', 'default', 'pause', [
            'enabled' => true,
            'reason' => 'Maintenance',
        ]);

        $control = $this->repository->getControl('redis', 'default', 'pause');

        $this->assertNotNull($control);
        $this->assertEquals('redis', $control['connection']);
        $this->assertEquals('default', $control['queue']);
        $this->assertEquals('pause', $control['type']);
        $this->assertTrue($control['data']['enabled']);
        $this->assertEquals('Maintenance', $control['data']['reason']);
    }

    public function test_get_non_existent_control(): void
    {
        $control = $this->repository->getControl('redis', 'default', 'nonexistent');

        $this->assertNull($control);
    }

    public function test_dashboard_stats(): void
    {
        // Create various job statuses
        for ($i = 1; $i <= 10; $i++) {
            $data = [
                'job_id' => "job-{$i}",
                'uuid' => "uuid-{$i}",
                'connection' => 'redis',
                'queue' => 'default',
                'name' => 'App\\Jobs\\TestJob',
                'attempts' => 1,
                'payload' => ['index' => $i],
                'started_at' => Carbon::now(),
            ];

            $this->repository->recordProcessing($data);

            if ($i <= 7) {
                // Process 7 jobs
                $this->repository->recordProcessed("job-{$i}", [
                    'connection' => 'redis',
                    'queue' => 'default',
                    'finished_at' => Carbon::now()->addSeconds(2),
                ]);
            } elseif ($i == 8) {
                // Fail 1 job
                $this->repository->recordFailed("job-{$i}", [
                    'connection' => 'redis',
                    'queue' => 'default',
                    'finished_at' => Carbon::now()->addSeconds(1),
                    'exception' => 'Error',
                ]);
            }
            // Leave 2 jobs processing (9, 10)
        }

        $stats = $this->repository->dashboardStats();

        $this->assertEquals(10, $stats['total']);
        $this->assertEquals(7, $stats['processed']);
        $this->assertEquals(1, $stats['failed']);
        $this->assertEquals(2, $stats['processing']);
        $this->assertGreaterThan(0, $stats['avg_runtime_ms']);
    }
}




