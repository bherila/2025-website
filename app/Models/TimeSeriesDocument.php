<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class TimeSeriesDocument extends Model
{
    protected $table = 'timeseries_documents';

    protected $fillable = [
        'uid',
        'name',
    ];

    public function series(): HasMany
    {
        return $this->hasMany(TimeSeriesSeries::class, 'document_id');
    }
}
