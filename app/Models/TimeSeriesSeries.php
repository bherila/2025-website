<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TimeSeriesSeries extends Model
{
    protected $table = 'timeseries_series';

    protected $fillable = [
        'document_id',
        'series_name',
    ];

    public function document(): BelongsTo
    {
        return $this->belongsTo(TimeSeriesDocument::class, 'document_id');
    }

    public function datapoints(): HasMany
    {
        return $this->hasMany(TimeSeriesDatapoint::class, 'dp_series_id');
    }
}
