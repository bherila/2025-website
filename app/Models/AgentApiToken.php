<?php

namespace App\Models;

use Database\Factories\AgentApiTokenFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Multi-record agent API token. Only a SHA-256 hash of the raw token is
 * stored; the raw value is shown to the user exactly once at creation time.
 *
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property string $purpose
 * @property string|null $client_hint
 * @property string|null $module
 * @property string $token_hash
 * @property string|null $token_prefix
 * @property list<string>|null $allowed_permissions
 * @property Carbon|null $expires_at
 * @property Carbon|null $revoked_at
 * @property Carbon|null $last_used_at
 */
class AgentApiToken extends Model
{
    /** @use HasFactory<AgentApiTokenFactory> */
    use HasFactory;

    public const PURPOSE_QUICK_SETUP = 'quick_setup';

    public const PURPOSE_PERSISTENT = 'persistent';

    public const PURPOSE_AUTOMATION = 'automation';

    protected $fillable = [
        'user_id',
        'name',
        'purpose',
        'client_hint',
        'module',
        'token_hash',
        'token_prefix',
        'allowed_permissions',
        'expires_at',
        'revoked_at',
        'last_used_at',
    ];

    protected $hidden = [
        'token_hash',
    ];

    protected function casts(): array
    {
        return [
            'allowed_permissions' => 'array',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'last_used_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Scope to tokens that are neither revoked nor expired.
     *
     * @param  Builder<self>  $query
     * @return Builder<self>
     */
    public function scopeValid(Builder $query): Builder
    {
        return $query
            ->whereNull('revoked_at')
            ->where(function (Builder $inner): void {
                $inner->whereNull('expires_at')->orWhere('expires_at', '>', now());
            });
    }

    public function isValid(): bool
    {
        if ($this->revoked_at !== null) {
            return false;
        }

        return $this->expires_at === null || $this->expires_at->isFuture();
    }
}
