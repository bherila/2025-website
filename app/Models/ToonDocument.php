<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ToonDocumentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ToonDocument extends Model
{
    /** @use HasFactory<ToonDocumentFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'short_code',
        'title',
        'toon_content',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
