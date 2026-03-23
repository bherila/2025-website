<?php

namespace App\GenAiProcessor\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;

class RunGenAiQueue extends Command
{
    protected $signature = 'genai:run-queue';

    protected $description = 'Process a batch of ready GenAI import jobs from the queue';

    public function handle(): int
    {
        $this->info('Processing GenAI import queue...');

        Artisan::call('queue:work', [
            '--queue' => 'genai-imports',
            '--once' => true,
            '--timeout' => 300,
            '--memory' => 256,
        ]);

        $this->info(Artisan::output());

        return self::SUCCESS;
    }
}
