<?php

namespace App\Models\ClientManagement;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\User;

class ClientCompany extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'company_name',
        'address',
        'website',
        'phone_number',
        'default_hourly_rate',
        'additional_notes',
        'is_active',
        'last_activity',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'last_activity' => 'datetime',
        'default_hourly_rate' => 'decimal:2',
    ];

    /**
     * Get the users associated with this client company.
     */
    public function users()
    {
        return $this->belongsToMany(User::class, 'client_company_user', 'client_company_id', 'user_id')
                    ->withTimestamps();
    }

    /**
     * Update the last activity timestamp.
     */
    public function touchLastActivity()
    {
        $this->last_activity = now();
        $this->save();
    }
}
