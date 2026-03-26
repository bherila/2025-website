<?php

namespace App\GenAiProcessor\Console\Commands;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;

class RunGenAiQueue extends Command
{
    protected $signature = 'genai:run-queue';

    protected $description = 'Process a batch of ready GenAI import jobs from the queue';

    public function handle(): int
    {
        $pendingCount = GenAiImportJob::where('status', 'pending')->count();
        $processingCount = GenAiImportJob::where('status', 'processing')->count();
        $queuedParseJobs = Queue::size('genai-imports');
        $oldestPendingJob = GenAiImportJob::where('status', 'pending')
            ->orderBy('created_at')
            ->first(['id', 'created_at', 'updated_at']);

        $this->info("Processing GenAI import queue... pending={$pendingCount}, processing={$processingCount}, queued_jobs={$queuedParseJobs}");
        if ($oldestPendingJob) {
            $this->line("Oldest pending GenAI job: id={$oldestPendingJob->id}, created_at={$oldestPendingJob->created_at}, updated_at={$oldestPendingJob->updated_at}");
        }
        Log::info('genai:run-queue start', [
            'pending' => $pendingCount,
            'processing' => $processingCount,
            'queued_parse_jobs' => $queuedParseJobs,
            'oldest_pending_job_id' => $oldestPendingJob?->id,
            'oldest_pending_job_created_at' => $oldestPendingJob?->created_at?->toDateTimeString(),
        ]);

        // Self-heal for orphaned pending jobs: if we have pending rows but no queued jobs
        // and nothing currently processing, re-dispatch a small batch.
        if ($pendingCount > 0 && $processingCount === 0 && $queuedParseJobs === 0) {
            $orphanedPendingJobs = GenAiImportJob::where('status', 'pending')
                ->orderBy('created_at')
                ->limit(10)
                ->pluck('id');

            foreach ($orphanedPendingJobs as $jobId) {
                ParseImportJob::dispatch((int) $jobId);
            }

            $this->warn('Detected pending GenAI jobs with empty queue; re-dispatched pending jobs for recovery.');
            Log::warning('genai:run-queue recovered orphaned pending jobs', [
                'job_ids' => $orphanedPendingJobs->all(),
            ]);
        }

        Artisan::call('queue:work', [
            '--queue' => 'genai-imports',
            '--stop-when-empty' => true,
            '--max-jobs' => 10,
            '--timeout' => 300,
            '--memory' => 512,
        ]);

        $output = trim(Artisan::output());
        if ($output !== '') {
            $this->line($output);
        }

        $pendingAfter = GenAiImportJob::where('status', 'pending')->count();
        $processingAfter = GenAiImportJob::where('status', 'processing')->count();
        $parsedAfter = GenAiImportJob::where('status', 'parsed')->count();
        $queuedJobsAfter = Queue::size('genai-imports');

        $this->info("GenAI queue run complete. pending={$pendingAfter}, processing={$processingAfter}, parsed={$parsedAfter}, queued_jobs={$queuedJobsAfter}");
        Log::info('genai:run-queue complete', [
            'pending' => $pendingAfter,
            'processing' => $processingAfter,
            'parsed' => $parsedAfter,
            'queued_parse_jobs' => $queuedJobsAfter,
        ]);

        return self::SUCCESS;
    }
}
