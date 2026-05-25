<?php

namespace App\Models\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientAgreement extends Model
{
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

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
        'catch_up_threshold_hours',
        'rollover_months',
        'hourly_rate',
        'monthly_retainer_fee',
        'retainer_fee',
        'retainer_hours',
        'is_visible_to_client',
        'billing_cadence',
        'bill_overage_interim',
        'first_cycle_proration',
        'initial_rollover_hours',
    ];

    protected $casts = [
        'active_date' => 'datetime',
        'termination_date' => 'datetime',
        'client_company_signed_date' => 'datetime',
        'monthly_retainer_hours' => 'decimal:2',
        'catch_up_threshold_hours' => 'decimal:2',
        'hourly_rate' => 'decimal:2',
        'monthly_retainer_fee' => 'decimal:2',
        'retainer_fee' => 'decimal:2',
        'retainer_hours' => 'decimal:4',
        'rollover_months' => 'integer',
        'is_visible_to_client' => 'boolean',
        'billing_cadence' => BillingCadence::class,
        'bill_overage_interim' => 'boolean',
        'first_cycle_proration' => FirstCycleProration::class,
        'initial_rollover_hours' => 'decimal:4',
    ];

    /**
     * Get the client company that owns this agreement.
     *
     * @return BelongsTo<ClientCompany, self>
     */
    public function clientCompany(): BelongsTo
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Get the user who signed the agreement on behalf of the client company.
     *
     * @return BelongsTo<User, self>
     */
    public function signedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_company_signed_user_id');
    }

    /**
     * Get the invoices associated with this agreement.
     *
     * @return HasMany<ClientInvoice, self>
     */
    public function invoices(): HasMany
    {
        return $this->hasMany(ClientInvoice::class, 'client_agreement_id');
    }

    /**
     * Get the recurring items attached to this agreement.
     *
     * @return HasMany<ClientAgreementRecurringItem, $this>
     */
    public function recurringItems(): HasMany
    {
        return $this->hasMany(ClientAgreementRecurringItem::class, 'client_agreement_id');
    }

    /**
     * Resolve the effective billing cadence (defaults to monthly when not set).
     */
    public function effectiveBillingCadence(): BillingCadence
    {
        return $this->billing_cadence ?? BillingCadence::Monthly;
    }

    /**
     * Resolve the effective first-cycle proration policy.
     */
    public function effectiveFirstCycleProration(): FirstCycleProration
    {
        return $this->first_cycle_proration ?? FirstCycleProration::ProrateHours;
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
        return ! $this->isSigned();
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
    public function terminate(?\DateTime $terminationDate = null): void
    {
        $this->update([
            'termination_date' => $terminationDate ?? now(),
        ]);
    }

    /**
     * Validate catch_up_threshold_hours is within valid range.
     *
     * @throws \InvalidArgumentException If catch_up_threshold_hours is invalid
     */
    public function validateCatchUpThreshold(): void
    {
        $threshold = (float) $this->catch_up_threshold_hours;
        $retainerHours = $this->periodRetainerHours();

        if ($threshold < 0 || $threshold > $retainerHours) {
            throw new \InvalidArgumentException(
                "catch_up_threshold_hours must be between 0 and monthly_retainer_hours ({$retainerHours}). Got: {$threshold}"
            );
        }
    }

    public function periodRetainerFee(): float
    {
        if ($this->retainer_fee !== null) {
            return (float) $this->retainer_fee;
        }

        return (float) $this->monthly_retainer_fee * $this->effectiveBillingCadence()->monthsInCycle();
    }

    public function periodRetainerHours(): float
    {
        if ($this->retainer_hours !== null) {
            return (float) $this->retainer_hours;
        }

        return (float) $this->monthly_retainer_hours * $this->effectiveBillingCadence()->monthsInCycle();
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::saving(function (ClientAgreement $agreement) {
            $retainerHours = (float) $agreement->monthly_retainer_hours;

            // Set default catch_up_threshold_hours if not set (null or '')
            if ($agreement->catch_up_threshold_hours === null || $agreement->catch_up_threshold_hours === '') {
                // Default to 1.0, but cap at monthly_retainer_hours
                $agreement->catch_up_threshold_hours = min(1.0, $retainerHours);
            }

            // Validate on save
            $agreement->validateCatchUpThreshold();
        });
    }
}
