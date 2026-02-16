<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Models\ClientManagement\ClientCompany;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable, SerializesDatesAsLocal;
 
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'gemini_api_key',
        'user_role',
        'last_login_date',
    ];
 
    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * The accessors to append to the model's array form.
     *
     * @var array
     */
    protected $appends = ['user_role', 'virtual_user_role'];

    /**
     * Override the user_role attribute to return Admin for all admin-level users.
     */
    public function getUserRoleAttribute(): string
    {
        return $this->hasRole('admin') ? 'Admin' : ($this->attributes['user_role'] ?? 'User');
    }

    /**
     * Alias for user_role for backward compatibility.
     */
    public function getVirtualUserRoleAttribute(): string
    {
        return $this->user_role;
    }
 
    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'last_login_date' => 'datetime',
        ];
    }

    public function getGeminiApiKey()
    {
        return $this->gemini_api_key;
    }

    /**
     * Check if user has a specific role.
     * Roles are stored as comma-separated lowercase strings in user_role column.
     */
    public function hasRole(string $role): bool
    {
        // User ID 1 always has admin role
        if ($role === 'admin' && $this->id === 1) {
            return true;
        }

        if (empty($this->user_role)) {
            return false;
        }

        $roles = array_map('trim', explode(',', strtolower($this->user_role)));

        return in_array(strtolower($role), $roles, true);
    }

    /**
     * Get all roles as an array.
     */
    public function getRoles(): array
    {
        if (empty($this->user_role)) {
            return $this->id === 1 ? ['admin'] : [];
        }

        $roles = array_map('trim', explode(',', strtolower($this->user_role)));

        // Ensure user ID 1 always has admin
        if ($this->id === 1 && ! in_array('admin', $roles, true)) {
            $roles[] = 'admin';
        }

        return array_values(array_unique($roles));
    }

    /**
     * Add a role to the user.
     */
    public function addRole(string $role): bool
    {
        $role = strtolower(trim($role));
        if (empty($role) || str_contains($role, ',')) {
            return false;
        }

        if ($this->hasRole($role)) {
            return true; // Already has role
        }

        $roles = $this->getRoles();
        $roles[] = $role;
        $this->user_role = implode(',', array_unique($roles));
        $this->save();

        return true;
    }

    /**
     * Remove a role from the user.
     * Cannot remove admin role from user ID 1.
     */
    public function removeRole(string $role): bool
    {
        $role = strtolower(trim($role));

        // Prevent removing admin from user ID 1
        if ($role === 'admin' && $this->id === 1) {
            return false;
        }

        $roles = $this->getRoles();
        $roles = array_filter($roles, fn ($r) => $r !== $role);
        $this->user_role = empty($roles) ? '' : implode(',', $roles);
        $this->save();

        return true;
    }

    /**
     * Check if user can log in (has user or admin role).
     */
    public function canLogin(): bool
    {
        return $this->hasRole('user') || $this->hasRole('admin');
    }

    /**
     * Get the client companies this user is associated with.
     */
    public function clientCompanies()
    {
        return $this->belongsToMany(ClientCompany::class, 'client_company_user', 'user_id', 'client_company_id')
            ->withTimestamps();
    }
}
