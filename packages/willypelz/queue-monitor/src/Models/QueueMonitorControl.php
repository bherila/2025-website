<?php

declare(strict_types=1);

namespace QueueMonitor\Models;

use Illuminate\Database\Eloquent\Model;

class QueueMonitorControl extends Model
{
    protected $table = 'queue_monitor_controls';

    protected $guarded = [];

    protected $casts = [
        'data' => 'array',
    ];
}

