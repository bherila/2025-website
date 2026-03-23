<?php

namespace App\GenAiProcessor\Console\Commands;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Services\GenAiJobDispatcherService;
use Illuminate\Console\Command;

class ProcessScheduledGenAiJobs extends Command
{
    protected $signature = 'genai:process-scheduled';

    protected $description = 'Promote queued_tomorrow GenAI jobs whose scheduled_for date has arrived';

    public function handle(GenAiJobDispatcherService $dispatcher): int
    {
        $jobs = GenAiImportJob::where('status', 'queued_tomorrow')
            ->where('scheduled_for', '<=', now()->utc()->toDateString())
            ->orderBy('created_at')
            ->get();

        if ($jobs->isEmpty()) {
            $this->info('No scheduled jobs to promote.');

            return self::SUCCESS;
        }

        $promoted = 0;
        foreach ($jobs as $job) {
            // Re-check quota per job; stop if exhausted
            if (! $dispatcher->claimQuota($job->user_id)) {
                $this->warn("Quota exhausted after promoting {$promoted} job(s). Remaining jobs stay queued.");
                break;
            }

            $job->update([
                'status' => 'pending',
                'scheduled_for' => null,
            ]);

            ParseImportJob::dispatch($job->id);
            $promoted++;
        }

        $this->info("Promoted {$promoted} scheduled job(s) to pending.");

        return self::SUCCESS;
    }
}
