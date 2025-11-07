<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GraduatedTax extends Model
{
    protected $table = 'graduated_tax';

    public $incrementing = false;

    protected $fillable = [
        'year',
        'region',
        'income_over',
        'type',
        'rate',
        'verified',
    ];

    protected function casts(): array
    {
        return [
            'rate' => 'decimal:4',
            'verified' => 'boolean',
        ];
    }
}
