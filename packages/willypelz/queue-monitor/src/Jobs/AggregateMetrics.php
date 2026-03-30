<?php

declare(strict_types=1);

namespace QueueMonitor\Jobs;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AggregateMetrics implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function handle(): void
    {
        $this->aggregateHourlyMetrics();
        $this->aggregateDailyMetrics();
    }

    private function aggregateHourlyMetrics(): void
    {
        $hourAgo = Carbon::now()->subHour();

        DB::table('queue_monitor_jobs')
            ->where('created_at', '>=', $hourAgo)
            ->groupBy(['connection', 'queue', DB::raw('DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00")')])
            ->select([
                'connection',
                'queue',
                DB::raw('DATE_FORMAT(created_at, "%Y-%m-%d %H:00:00") as period'),
                DB::raw('COUNT(*) as total_jobs'),
                DB::raw('SUM(CASE WHEN status = "processed" THEN 1 ELSE 0 END) as processed'),
                DB::raw('SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed'),
                DB::raw('AVG(runtime_ms) as avg_runtime'),
                DB::raw('MAX(runtime_ms) as max_runtime'),
                DB::raw('MIN(runtime_ms) as min_runtime'),
            ])
            ->get()
            ->each(function ($metric) {
                DB::table('queue_monitor_metrics')->updateOrInsert(
                    [
                        'connection' => $metric->connection,
                        'queue' => $metric->queue,
                        'period' => $metric->period,
                        'period_type' => 'hourly',
                    ],
                    [
                        'total_jobs' => $metric->total_jobs,
                        'processed' => $metric->processed,
                        'failed' => $metric->failed,
                        'avg_runtime' => $metric->avg_runtime,
                        'max_runtime' => $metric->max_runtime,
                        'min_runtime' => $metric->min_runtime,
                        'updated_at' => Carbon::now(),
                    ]
                );
            });
    }

    private function aggregateDailyMetrics(): void
    {
        $dayAgo = Carbon::now()->subDay();

        DB::table('queue_monitor_jobs')
            ->where('created_at', '>=', $dayAgo)
            ->groupBy(['connection', 'queue', DB::raw('DATE(created_at)')])
            ->select([
                'connection',
                'queue',
                DB::raw('DATE(created_at) as period'),
                DB::raw('COUNT(*) as total_jobs'),
                DB::raw('SUM(CASE WHEN status = "processed" THEN 1 ELSE 0 END) as processed'),
                DB::raw('SUM(CASE WHEN status = "failed" THEN 1 ELSE 0 END) as failed'),
                DB::raw('AVG(runtime_ms) as avg_runtime'),
                DB::raw('MAX(runtime_ms) as max_runtime'),
                DB::raw('MIN(runtime_ms) as min_runtime'),
            ])
            ->get()
            ->each(function ($metric) {
                DB::table('queue_monitor_metrics')->updateOrInsert(
                    [
                        'connection' => $metric->connection,
                        'queue' => $metric->queue,
                        'period' => $metric->period,
                        'period_type' => 'daily',
                    ],
                    [
                        'total_jobs' => $metric->total_jobs,
                        'processed' => $metric->processed,
                        'failed' => $metric->failed,
                        'avg_runtime' => $metric->avg_runtime,
                        'max_runtime' => $metric->max_runtime,
                        'min_runtime' => $metric->min_runtime,
                        'updated_at' => Carbon::now(),
                    ]
                );
            });
    }
}

