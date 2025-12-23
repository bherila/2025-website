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
        'slug',
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
     * Generate a slug from a company name.
     * Converts to lowercase, replaces non a-z characters with dashes, collapses consecutive dashes.
     */
    public static function generateSlug(string $name): string
    {
        $slug = strtolower($name);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
        $slug = preg_replace('/-+/', '-', $slug);
        $slug = trim($slug, '-');
        return $slug;
    }

    /**
     * Get the users associated with this client company.
     */
    public function users()
    {
        return $this->belongsToMany(User::class, 'client_company_user', 'client_company_id', 'user_id')
                    ->withTimestamps();
    }

    /**
     * Get the projects associated with this client company.
     */
    public function projects()
    {
        return $this->hasMany(Project::class, 'client_company_id');
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
