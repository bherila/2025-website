<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VXCVLinks extends Model
{
    protected $table = 'vxcv_links';

    protected $primaryKey = 'uniqueid';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'uniqueid',
        'url',
    ];
}
