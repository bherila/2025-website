<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FinAccountTag extends Model
{
    protected $table = 'fin_account_tag';

    protected $primaryKey = 'tag_id';

    protected $fillable = [
        'tag_userid',
        'tag_color',
        'tag_label',
        'when_added',
        'when_deleted',
    ];

    protected function casts(): array
    {
        return [
            'when_added' => 'datetime',
            'when_deleted' => 'datetime',
        ];
    }

    public function lineItemTagMaps(): HasMany
    {
        return $this->hasMany(FinAccountLineItemTagMap::class, 'tag_id');
    }
}
