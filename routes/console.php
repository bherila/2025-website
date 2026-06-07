<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// GenAI import queue processing
Schedule::command('genai:run-queue')->everyMinute()->withoutOverlapping(30);
Schedule::command('genai:process-scheduled')->everyMinute()->withoutOverlapping(5);
Schedule::command('genai:requeue-stale')->everyFiveMinutes()->withoutOverlapping(5);

// PHR DICOM storage cleanup: reclaim stuck pending uploads + orphan objects.
Schedule::command('phr:dicom:gc')->hourly()->withoutOverlapping(30);
Schedule::command('phr:exports:purge')->daily()->withoutOverlapping(30);

// Auth audit log retention pruning (bherila/auth-laravel >= 0.4.2).
// No-op unless BHERILA_AUTH_AUDIT_RETENTION_DAYS is set in .env.
Schedule::command('bherila-auth:prune-audit-log')->daily()->withoutOverlapping(10);
