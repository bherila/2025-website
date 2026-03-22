<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

class FinPayslipUploads extends Model
{
    protected $table = 'fin_payslip_uploads';

    protected $fillable = [
        'file_name',
        'file_hash',
        'parsed_json',
    ];
}
