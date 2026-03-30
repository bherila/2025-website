<?php

declare(strict_types=1);

namespace QueueMonitor\Models;

use Illuminate\Database\Eloquent\Model;

class QueueMonitorJob extends Model
{
    protected $table = 'queue_monitor_jobs';

    protected $guarded = [];

    protected $casts = [
        'payload' => 'array',
        'started_at' => 'datetime',
        'finished_at' => 'datetime',
        'runtime_ms' => 'integer',
        'attempts' => 'integer',
    ];
}

