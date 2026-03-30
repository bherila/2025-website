<?php

namespace App\Models;

use App\Casts\IpAddressCast;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LoginAuditLog extends Model
{
    protected $table = 'login_audit_log';

    protected $fillable = [
        'user_id',
        'email',
        'ip_address',
        'user_agent',
        'success',
        'method',
        'is_suspicious',
    ];

    protected $casts = [
        'success' => 'boolean',
        'is_suspicious' => 'boolean',
        'ip_address' => IpAddressCast::class,
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
