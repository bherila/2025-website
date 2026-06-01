<?php

namespace App\Models\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\ProposalItemKind;
use App\Enums\ClientManagement\ProposalStatus;
use App\Models\User;
use App\Services\Finance\MoneyMath;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ClientManagement\ClientProposalFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A versioned, semi-structured proposal sent to a client company.
 *
 * Each row is one version of a proposal; versions are chained by `root_id`
 * (the first version's id), `version`, and `previous_version_id`. On
 * acceptance a proposal materializes a signed {@see ClientAgreement}, a draft
 * upfront invoice, a project, and tasks.
 */
class ClientProposal extends Model
{
    /** @use HasFactory<ClientProposalFactory> */
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'client_proposals';

    protected $fillable = [
        'client_company_id',
        'root_id',
        'version',
        'previous_version_id',
        'agreement_id',
        'project_id',
        'status',
        'is_visible_to_client',
        'sent_at',
        'expires_at',
        'title',
        'body_markdown',
        'base_amount',
        'base_description',
        'credit_amount',
        'credit_label',
        'payment_net_days',
        'estimated_completion_days',
        'retainer_amount',
        'retainer_interval_months',
        'retainer_included_hours',
        'retainer_hourly_rate',
        'retainer_description',
        'client_response_message',
        'response_name',
        'response_title',
        'responded_at',
        'responded_by_user_id',
        'accepted_at',
        'accepted_by_user_id',
        'accept_signature_name',
        'accept_signature_title',
    ];

    protected $casts = [
        'status' => ProposalStatus::class,
        'is_visible_to_client' => 'boolean',
        'sent_at' => 'datetime',
        'expires_at' => 'datetime',
        'responded_at' => 'datetime',
        'accepted_at' => 'datetime',
        'base_amount' => 'decimal:2',
        'credit_amount' => 'decimal:2',
        'retainer_amount' => 'decimal:2',
        'retainer_hourly_rate' => 'decimal:2',
        'retainer_included_hours' => 'decimal:4',
        'version' => 'integer',
        'payment_net_days' => 'integer',
        'estimated_completion_days' => 'integer',
        'retainer_interval_months' => 'integer',
    ];

    /**
     * @return BelongsTo<ClientCompany, $this>
     */
    public function clientCompany(): BelongsTo
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * @return BelongsTo<ClientProject, $this>
     */
    public function project(): BelongsTo
    {
        return $this->belongsTo(ClientProject::class, 'project_id');
    }

    /**
     * The agreement materialized when this proposal was accepted.
     *
     * @return BelongsTo<ClientAgreement, $this>
     */
    public function agreement(): BelongsTo
    {
        return $this->belongsTo(ClientAgreement::class, 'agreement_id');
    }

    /**
     * @return HasMany<ClientProposalItem, $this>
     */
    public function items(): HasMany
    {
        return $this->hasMany(ClientProposalItem::class, 'client_proposal_id')->orderBy('sort_order');
    }

    /**
     * @return BelongsTo<ClientProposal, $this>
     */
    public function previousVersion(): BelongsTo
    {
        return $this->belongsTo(self::class, 'previous_version_id');
    }

    /**
     * All versions in this proposal's chain (including itself).
     *
     * @return HasMany<ClientProposal, $this>
     */
    public function versions(): HasMany
    {
        return $this->hasMany(self::class, 'root_id', 'root_id')->orderBy('version');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function respondedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'responded_by_user_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function acceptedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'accepted_by_user_id');
    }

    /**
     * Whether this is the most recent version in its chain.
     */
    public function isLatestVersion(): bool
    {
        return ! self::query()
            ->where('root_id', $this->root_id ?? $this->id)
            ->where('version', '>', $this->version)
            ->exists();
    }

    /**
     * Whether the proposal can still be edited by an admin (draft only).
     */
    public function isEditable(): bool
    {
        return $this->status === ProposalStatus::Draft;
    }

    public function isAccepted(): bool
    {
        return $this->status === ProposalStatus::Accepted;
    }

    /**
     * Whether the proposal is awaiting a client decision on its latest version.
     *
     * Mirrors {@see canBeActedOnByClient()} exactly so the server action gate and
     * the client-facing "can act" flag never disagree (e.g. a latest
     * `changes_requested` version stays actionable rather than 422-ing).
     */
    public function isPending(): bool
    {
        return $this->canBeActedOnByClient();
    }

    /**
     * Whether a client may accept/reject/request-changes on this version.
     */
    public function canBeActedOnByClient(): bool
    {
        return $this->status->canClientAct() && $this->isLatestVersion();
    }

    /**
     * Sum of the base fee plus all included one-time add-ons (mandatory items
     * always count; optional items only when `is_selected`). Money via MoneyMath.
     */
    public function upfrontSubtotal(): float
    {
        $addOnAmounts = $this->items
            ->filter(fn (ClientProposalItem $item): bool => $item->kind === ProposalItemKind::AddOn
                && $item->charge_cadence === ChargeCadence::OneTime
                && ($item->is_selected || ! $item->is_optional))
            ->map(fn (ClientProposalItem $item): string => (string) $item->amount)
            ->all();

        return MoneyMath::sum([(string) $this->base_amount, ...array_values($addOnAmounts)]);
    }

    /**
     * Upfront subtotal less any credit. Money via MoneyMath.
     */
    public function upfrontNet(): float
    {
        return MoneyMath::subtract($this->upfrontSubtotal(), (string) ($this->credit_amount ?? 0));
    }

    /**
     * Map the retainer interval (months) to a BillingCadence, or null when no
     * retainer is configured. Iterates BillingCadence so it can never drift
     * from the enum's month counts.
     */
    public function retainerBillingCadence(): ?BillingCadence
    {
        if ($this->retainer_amount === null || $this->retainer_interval_months === null) {
            return null;
        }

        foreach (BillingCadence::cases() as $cadence) {
            if ($cadence->monthsInCycle() === (int) $this->retainer_interval_months) {
                return $cadence;
            }
        }

        return null;
    }

    /**
     * The "booted" method of the model.
     */
    protected static function booted(): void
    {
        static::created(function (ClientProposal $proposal): void {
            if ($proposal->root_id === null) {
                $proposal->root_id = $proposal->id;
                $proposal->saveQuietly();
            }
        });
    }
}
