<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VXCVFiles extends Model
{
    protected $table = 'vxcv_files';

    protected $primaryKey = 'hash';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = [
        'hash',
        'filename',
        'mime',
        'downloads',
        'max_downloads',
        'size',
        'uploaded',
        'blocked',
        'ip',
    ];

    protected function casts(): array
    {
        return [
            'uploaded' => 'datetime',
        ];
    }
}
