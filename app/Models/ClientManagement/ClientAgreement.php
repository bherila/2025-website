<?php

namespace App\Models\ClientManagement;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use App\Models\User;
use App\Traits\SerializesDatesAsLocal;

class ClientAgreement extends Model
{
    use SoftDeletes, SerializesDatesAsLocal;

    protected $table = 'client_agreements';

    protected $fillable = [
        'client_company_id',
        'active_date',
        'termination_date',
        'agreement_text',
        'agreement_link',
        'client_company_signed_date',
        'client_company_signed_user_id',
        'client_company_signed_name',
        'client_company_signed_title',
        'monthly_retainer_hours',
        'rollover_months',
        'hourly_rate',
        'monthly_retainer_fee',
        'is_visible_to_client',
    ];

    protected $casts = [
        'active_date' => 'datetime',
        'termination_date' => 'datetime',
        'client_company_signed_date' => 'datetime',
        'monthly_retainer_hours' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'monthly_retainer_fee' => 'decimal:2',
        'rollover_months' => 'integer',
        'is_visible_to_client' => 'boolean',
    ];

    /**
     * Get the client company that owns this agreement.
     */
    public function clientCompany()
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the user who signed the agreement on behalf of the client company.
     */
    public function signedByUser()
    {
        return $this->belongsTo(User::class, 'client_company_signed_user_id');
    }

    /**
     * Get the invoices associated with this agreement.
     */
    public function invoices()
    {
        return $this->hasMany(ClientInvoice::class, 'client_agreement_id');
    }

    /**
     * Check if the agreement is currently active.
     */
    public function isActive(): bool
    {
        $now = now();
        return $this->active_date <= $now && 
               ($this->termination_date === null || $this->termination_date > $now);
    }

    /**
     * Check if the agreement has been signed.
     */
    public function isSigned(): bool
    {
        return $this->client_company_signed_date !== null;
    }

    /**
     * Check if the agreement can be edited (not signed yet).
     */
    public function isEditable(): bool
    {
        return !$this->isSigned();
    }

    /**
     * Sign the agreement.
     */
    public function sign(User $user, string $name, string $title): void
    {
        $this->update([
            'client_company_signed_date' => now(),
            'client_company_signed_user_id' => $user->id,
            'client_company_signed_name' => $name,
            'client_company_signed_title' => $title,
        ]);
    }

    /**
     * Terminate the agreement.
     */
    public function terminate(\DateTime $terminationDate = null): void
    {
        $this->update([
            'termination_date' => $terminationDate ?? now(),
        ]);
    }
}
