<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FinAccountLineItemLink extends Model
{
    protected $table = 'fin_account_line_item_links';
    public $timestamps = false;

    protected $fillable = [
        'parent_t_id',
        'child_t_id',
        'when_added',
        'when_deleted',
    ];

    protected $casts = [
        'when_added' => 'datetime',
        'when_deleted' => 'datetime',
    ];

    /**
     * Get the parent transaction
     */
    public function parentTransaction()
    {
        return $this->belongsTo(FinAccountLineItems::class, 'parent_t_id', 't_id');
    }

    /**
     * Get the child transaction
     */
    public function childTransaction()
    {
        return $this->belongsTo(FinAccountLineItems::class, 'child_t_id', 't_id');
    }
}
