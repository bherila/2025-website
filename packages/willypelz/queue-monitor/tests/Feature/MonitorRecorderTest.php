<?php

declare(strict_types=1);

namespace QueueMonitor\Tests\Feature;

use Illuminate\Support\Facades\Event;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\Events\JobProcessed;
use Illuminate\Queue\Events\JobFailed;
use PHPUnit\Framework\Attributes\Test;
use QueueMonitor\Models\QueueMonitorJob;
use QueueMonitor\Tests\TestCase;

class MonitorRecorderTest extends TestCase
{
    protected function defineEnvironment($app): void
    {
        // Use database driver for this test
        $app['config']->set('queue-monitor.driver', 'database');
    }

    #[Test]
    public function it_records_job_processing(): void
    {
        $this->artisan('migrate')->run();

        // Dispatch a test job
        Event::dispatch(new JobProcessing('database', $this->createMockJob()));

        $this->assertDatabaseHas('queue_monitor_jobs', [
            'connection' => 'database',
            'queue' => 'default',
            'status' => 'processing',
        ]);
    }

    #[Test]
    public function it_tracks_job_runtime(): void
    {
        $this->artisan('migrate')->run();

        $job = $this->createMockJob();

        Event::dispatch(new JobProcessing('database', $job));
        sleep(1);
        Event::dispatch(new JobProcessed('database', $job));

        $record = QueueMonitorJob::first();
        $this->assertNotNull($record->runtime_ms);
        $this->assertGreaterThan(0, $record->runtime_ms);
    }

    private function createMockJob()
    {
        return new class {
            public function getConnectionName() { return 'database'; }
            public function getQueue() { return 'default'; }
            public function resolveName() { return 'TestJob'; }
            public function attempts() { return 1; }
            public function payload() {
                return [
                    'uuid' => 'test-uuid',
                    'displayName' => 'TestJob',
                    'data' => []
                ];
            }
            public function getJobId() { return 'test-job-id'; }
        };
    }
}

