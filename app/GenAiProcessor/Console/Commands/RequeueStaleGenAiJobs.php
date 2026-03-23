<?php

namespace App\GenAiProcessor\Console\Commands;

use App\GenAiProcessor\Models\GenAiImportJob;
use Illuminate\Console\Command;

class RequeueStaleGenAiJobs extends Command
{
    protected $signature = 'genai:requeue-stale';

    protected $description = 'Reset GenAI jobs stuck in processing state for more than 10 minutes';

    public function handle(): int
    {
        $staleJobs = GenAiImportJob::where('status', 'processing')
            ->where('updated_at', '<', now()->subMinutes(10))
            ->get();

        if ($staleJobs->isEmpty()) {
            $this->info('No stale jobs found.');

            return self::SUCCESS;
        }

        $count = 0;
        foreach ($staleJobs as $job) {
            $job->update([
                'status' => 'pending',
                'error_message' => 'Job timed out (stale recovery). Will be retried automatically.',
            ]);
            $count++;
        }

        $this->info("Reset {$count} stale job(s) to pending.");

        return self::SUCCESS;
    }
}
