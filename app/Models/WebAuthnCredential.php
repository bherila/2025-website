<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebAuthnCredential extends Model
{
    protected $table = 'webauthn_credentials';

    protected $fillable = [
        'user_id',
        'credential_id',
        'public_key',
        'counter',
        'aaguid',
        'name',
        'transports',
    ];

    protected $casts = [
        'counter' => 'integer',
        'transports' => 'array',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
