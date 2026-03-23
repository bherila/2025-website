<?php

namespace App\GenAiProcessor\Console\Commands;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Console\Command;

class ProcessScheduledGenAiJobs extends Command
{
    protected $signature = 'genai:process-scheduled';

    protected $description = 'Promote queued_tomorrow GenAI jobs whose scheduled_for date has arrived';

    public function handle(): int
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
            // Promote to pending and dispatch — quota is checked inside the worker
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
