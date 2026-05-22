<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\MarkdownDocumentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarkdownDocument extends Model
{
    /** @use HasFactory<MarkdownDocumentFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'short_code',
        'title',
        'markdown_content',
    ];

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
