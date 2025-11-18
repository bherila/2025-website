<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinStatementDetail extends Model
{
    protected $table = 'fin_statement_details';

    protected $fillable = [
        'snapshot_id',
        'section',
        'line_item',
        'statement_period_value',
        'ytd_value',
        'is_percentage',
    ];
}
