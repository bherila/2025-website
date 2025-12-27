<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinAccountLineItemTagMap extends Model
{
    protected $table = 'fin_account_line_item_tag_map';

    protected $primaryKey = ['t_id', 'tag_id'];

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = [
        't_id',
        'tag_id',
        'when_deleted',
    ];
}
