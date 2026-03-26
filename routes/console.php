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
