<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinAccountLineItemTagMap extends Model
{
    protected $table = 'fin_account_line_item_tag_map';

    protected $fillable = [
        'when_added',
        'when_deleted',
        't_id',
        'tag_id',
    ];

    protected function casts(): array
    {
        return [
            'when_added' => 'datetime',
            'when_deleted' => 'datetime',
        ];
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(FinAccountLineItems::class, 't_id', 't_id');
    }

    public function tag(): BelongsTo
    {
        return $this->belongsTo(FinAccountTag::class, 'tag_id');
    }
}
