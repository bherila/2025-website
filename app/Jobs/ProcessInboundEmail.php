<?php

namespace App\Jobs;

use App\Models\InboundEmail;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ProcessInboundEmail implements ShouldQueue
{
    use Queueable;

    /**
     * Create a new job instance.
     */
    public function __construct(public InboundEmail $email) {}

    /**
     * Execute the job.
     *
     * Extension point for downstream routing of inbound mail, e.g. forwarding
     * statements into account statements, queuing receipts/class-action emails
     * for GenAI processing, etc. Marks the record processed for now.
     */
    public function handle(): void
    {
        $this->email->update(['status' => 'processed']);
    }
}
