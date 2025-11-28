<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinAccountLineItems extends Model
{
    protected $table = 'fin_account_line_items';
    protected $primaryKey = 't_id';
    public $timestamps = false;

    protected $fillable = [
        't_account',
        't_date',
        't_date_posted',
        't_type',
        't_schc_category',
        't_amt',
        't_symbol',
        't_cusip',
        't_qty',
        't_price',
        't_commission',
        't_fee',
        't_method',
        't_source',
        't_origin',
        'opt_expiration',
        'opt_type',
        'opt_strike',
        't_description',
        't_comment',
        't_from',
        't_to',
        't_interest_rate',
        't_harvested_amount',
        'parent_t_id',
        't_account_balance',
    ];

    public function account()
    {
        return $this->belongsTo(FinAccounts::class, 't_account', 'acct_id');
    }

    public function tags()
    {
        return $this->belongsToMany(FinAccountTag::class, 'fin_account_line_item_tag_map', 't_id', 'tag_id');
    }
}