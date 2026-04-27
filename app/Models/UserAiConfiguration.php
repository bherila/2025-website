<?php

namespace App\Models;

use Database\Factories\UserAiConfigurationFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserAiConfiguration extends Model
{
    /** @use HasFactory<UserAiConfigurationFactory> */
    use HasFactory;

    protected $fillable = [
        'user_id',
        'name',
        'provider',
        'api_key',
        'region',
        'session_token',
        'model',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'api_key' => 'encrypted',
            'session_token' => 'encrypted',
            'is_active' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return array{id: int, name: string, provider: string, model: string, masked_key: string, region: string|null, is_active: bool, created_at: string|null} */
    public function toApiArray(): array
    {
        $key = $this->api_key ?? '';
        $maskedKey = strlen($key) > 4 ? '••••'.substr($key, -4) : '••••';

        return [
            'id' => $this->id,
            'name' => $this->name,
            'provider' => $this->provider,
            'model' => $this->model,
            'masked_key' => $maskedKey,
            'region' => $this->region,
            'is_active' => $this->is_active,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
