<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use QueueMonitor\Http\Controllers\DashboardController;
use QueueMonitor\Http\Controllers\QueueControlController;

Route::prefix(config('queue-monitor.path', 'queue-monitor'))
    ->middleware(config('queue-monitor.middleware', ['web']))
    ->group(function () {
        Route::get('/', [DashboardController::class, 'index'])->name('queue-monitor.dashboard');
        Route::get('/api/stats', [DashboardController::class, 'stats'])->name('queue-monitor.stats');
        Route::get('/api/jobs', [DashboardController::class, 'jobs'])->name('queue-monitor.jobs');

        // Queue controls
        Route::post('/api/control/pause', [QueueControlController::class, 'pause'])->name('queue-monitor.control.pause');
        Route::post('/api/control/resume', [QueueControlController::class, 'resume'])->name('queue-monitor.control.resume');
        Route::post('/api/control/throttle', [QueueControlController::class, 'throttle'])->name('queue-monitor.control.throttle');
        Route::post('/api/control/retry', [QueueControlController::class, 'retry'])->name('queue-monitor.control.retry');
    });

