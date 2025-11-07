<?php

namespace App\Models;

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
