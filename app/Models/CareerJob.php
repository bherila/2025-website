<?php

namespace App\Models;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\CareerJobFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CareerJob extends Model
{
    /** @use HasFactory<CareerJobFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'kind',
        'name',
        'spec_json',
    ];

    protected function casts(): array
    {
        return [
            'spec_json' => 'array',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
