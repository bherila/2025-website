<?php

namespace App\Models\ClientManagement;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ClientManagement\ClientCompanyFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientCompany extends Model
{
    /** @use HasFactory<ClientCompanyFactory> */
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

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
     *
     * @return BelongsToMany<User, self>
     */
    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'client_company_user', 'client_company_id', 'user_id')
            ->withTimestamps();
    }

    /**
     * Get the projects associated with this client company.
     *
     * @return HasMany<ClientProject, self>
     */
    public function projects(): HasMany
    {
        return $this->hasMany(ClientProject::class, 'client_company_id');
    }

    /**
     * Get the agreements associated with this client company.
     *
     * @return HasMany<ClientAgreement, self>
     */
    public function agreements(): HasMany
    {
        return $this->hasMany(ClientAgreement::class, 'client_company_id');
    }

    /**
     * Get the currently active agreement.
     */
    public function activeAgreement(): ?ClientAgreement
    {
        $now = now();

        return $this->agreements()
            ->where('active_date', '<=', $now)
            ->where(function ($query) use ($now) {
                $query->whereNull('termination_date')
                    ->orWhere('termination_date', '>', $now);
            })
            ->orderBy('active_date', 'desc')
            ->first();
    }

    /**
     * Get the most recent agreement regardless of active/terminated status.
     * Used for post-termination invoicing.
     */
    public function mostRecentAgreement(): ?ClientAgreement
    {
        return $this->agreements()
            ->where('active_date', '<=', now())
            ->orderBy('active_date', 'desc')
            ->first();
    }

    /**
     * Get the invoices associated with this client company.
     *
     * @return HasMany<ClientInvoice, self>
     */
    public function invoices(): HasMany
    {
        return $this->hasMany(ClientInvoice::class, 'client_company_id');
    }

    /**
     * Get time entries for this client company.
     *
     * @return HasMany<ClientTimeEntry, self>
     */
    public function timeEntries(): HasMany
    {
        return $this->hasMany(ClientTimeEntry::class, 'client_company_id');
    }

    /**
     * Get tasks for this client company (through projects).
     *
     * @return HasManyThrough<ClientTask, ClientProject, self>
     */
    public function tasks(): HasManyThrough
    {
        return $this->hasManyThrough(
            ClientTask::class,
            ClientProject::class,
            'client_company_id', // Foreign key on projects table
            'project_id',        // Foreign key on tasks table
            'id',                // Local key on companies table
            'id'                 // Local key on projects table
        );
    }

    /**
     * Update the last activity timestamp.
     */
    public function touchLastActivity(): void
    {
        $this->last_activity = now();
        $this->save();
    }
}
