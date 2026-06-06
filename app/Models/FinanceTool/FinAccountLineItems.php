<?php

namespace App\Models\FinanceTool;

use App\Models\ClientManagement\ClientExpense;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class FinAccountLineItems extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'fin_account_line_items';

    protected $primaryKey = 't_id';

    protected $fillable = [
        't_account',
        'statement_id',
        'external_id',
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

    protected $casts = [
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<FinAccounts, $this>
     */
    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 't_account', 'acct_id');
    }

    /**
     * @return BelongsTo<FinStatement, $this>
     */
    public function statement(): BelongsTo
    {
        return $this->belongsTo(FinStatement::class, 'statement_id', 'statement_id');
    }

    /**
     * @return BelongsToMany<FinAccountTag, $this>
     */
    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(FinAccountTag::class, 'fin_account_line_item_tag_map', 't_id', 'tag_id');
    }

    /**
     * Get links where this transaction is the parent
     */
    /**
     * @return HasMany<FinAccountLineItemLink, $this>
     */
    public function childLinks(): HasMany
    {
        return $this->hasMany(FinAccountLineItemLink::class, 'parent_t_id', 't_id');
    }

    /**
     * Get links where this transaction is the child
     */
    /**
     * @return HasMany<FinAccountLineItemLink, $this>
     */
    public function parentLinks(): HasMany
    {
        return $this->hasMany(FinAccountLineItemLink::class, 'child_t_id', 't_id');
    }

    /**
     * Get all child transactions (transactions linked to this one as parent)
     */
    /**
     * @return BelongsToMany<FinAccountLineItems, $this>
     */
    public function childTransactions(): BelongsToMany
    {
        return $this->belongsToMany(
            FinAccountLineItems::class,
            'fin_account_line_item_links',
            'parent_t_id',
            'child_t_id',
            't_id',
            't_id'
        );
    }

    /**
     * Get all parent transactions (transactions this one is linked to as child)
     */
    /**
     * @return BelongsToMany<FinAccountLineItems, $this>
     */
    public function parentTransactions(): BelongsToMany
    {
        return $this->belongsToMany(
            FinAccountLineItems::class,
            'fin_account_line_item_links',
            'child_t_id',
            'parent_t_id',
            't_id',
            't_id'
        );
    }

    /**
     * Get the client expense linked to this line item.
     */
    /**
     * @return HasOne<ClientExpense, $this>
     */
    public function clientExpense(): HasOne
    {
        return $this->hasOne(ClientExpense::class, 'fin_line_item_id', 't_id');
    }
}
