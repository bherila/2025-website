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

    /**
     * Get links where this transaction is the parent
     */
    public function childLinks()
    {
        return $this->hasMany(FinAccountLineItemLink::class, 'parent_t_id', 't_id')
            ->whereNull('when_deleted');
    }

    /**
     * Get links where this transaction is the child
     */
    public function parentLinks()
    {
        return $this->hasMany(FinAccountLineItemLink::class, 'child_t_id', 't_id')
            ->whereNull('when_deleted');
    }

    /**
     * Get all child transactions (transactions linked to this one as parent)
     */
    public function childTransactions()
    {
        return $this->belongsToMany(
            FinAccountLineItems::class,
            'fin_account_line_item_links',
            'parent_t_id',
            'child_t_id',
            't_id',
            't_id'
        )->wherePivotNull('when_deleted');
    }

    /**
     * Get all parent transactions (transactions this one is linked to as child)
     */
    public function parentTransactions()
    {
        return $this->belongsToMany(
            FinAccountLineItems::class,
            'fin_account_line_item_links',
            'child_t_id',
            'parent_t_id',
            't_id',
            't_id'
        )->wherePivotNull('when_deleted');
    }
}
