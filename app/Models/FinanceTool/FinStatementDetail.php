<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

class FinStatementDetail extends Model
{
    protected $table = 'fin_statement_details';

    protected $fillable = [
        'statement_id',
        'section',
        'line_item',
        'statement_period_value',
        'ytd_value',
        'is_percentage',
    ];
}
