<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TimeSeriesDatapoint extends Model
{
    protected $table = 'timeseries_datapoint';

    protected $primaryKey = 'dp_id';

    protected $fillable = [
        'dp_series_id',
        'dp_date',
        'dp_value',
        'dp_comment',
    ];

    protected function casts(): array
    {
        return [
            'dp_date' => 'date',
        ];
    }

    public function series(): BelongsTo
    {
        return $this->belongsTo(TimeSeriesSeries::class, 'dp_series_id');
    }
}
