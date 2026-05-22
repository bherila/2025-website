<?php

namespace App\Models;

use App\Models\FinanceTool\FinAccountLineItems;
use App\Traits\SerializesDatesAsLocal;
use Carbon\CarbonInterface;
use Database\Factories\ClassActionClaimFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property int $id
 * @property int $user_id
 * @property string $name
 * @property string|null $claim_id
 * @property string|null $pin
 * @property CarbonInterface|null $notification_received_on
 * @property string|null $notification_email_copy
 * @property string|null $class_action_url
 * @property CarbonInterface|null $payment_election_submitted_on
 * @property CarbonInterface|null $claim_submitted_on
 * @property CarbonInterface|null $claim_deadline
 * @property string|null $administrator
 * @property string|null $defendant
 * @property CarbonInterface|null $final_approval_hearing_on
 * @property string|null $expected_payment_amount
 * @property CarbonInterface|null $expected_payment_on
 * @property string|null $actual_payment_amount
 * @property bool $payment_received
 * @property CarbonInterface|null $payment_received_on
 * @property int|null $payment_fin_transaction_id
 * @property string|null $notes
 */
class ClassActionClaim extends Model
{
    /** @use HasFactory<ClassActionClaimFactory> */
    use HasFactory;

    use SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'name',
        'claim_id',
        'pin',
        'notification_received_on',
        'notification_email_copy',
        'class_action_url',
        'payment_election_submitted_on',
        'claim_submitted_on',
        'claim_deadline',
        'administrator',
        'defendant',
        'final_approval_hearing_on',
        'expected_payment_amount',
        'expected_payment_on',
        'actual_payment_amount',
        'payment_received',
        'payment_received_on',
        'payment_fin_transaction_id',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'notification_received_on' => 'date',
            'payment_election_submitted_on' => 'date',
            'claim_submitted_on' => 'date',
            'claim_deadline' => 'date',
            'final_approval_hearing_on' => 'date',
            'expected_payment_amount' => 'decimal:2',
            'expected_payment_on' => 'date',
            'actual_payment_amount' => 'decimal:2',
            'payment_received' => 'boolean',
            'payment_received_on' => 'date',
            'payment_fin_transaction_id' => 'integer',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<FinAccountLineItems, $this> */
    public function paymentTransaction(): BelongsTo
    {
        return $this->belongsTo(FinAccountLineItems::class, 'payment_fin_transaction_id', 't_id');
    }

    /** @param  Builder<self>  $query */
    public function scopeForUser(Builder $query, int $userId): void
    {
        $query->withoutGlobalScopes()->where('user_id', $userId);
    }

    protected static function booted(): void
    {
        static::creating(function (self $claim): void {
            if (auth()->check() && empty($claim->user_id)) {
                $claim->user_id = (int) auth()->id();
            }
        });

        static::addGlobalScope('user', function (Builder $builder): void {
            if (auth()->check()) {
                $builder->where('user_id', auth()->id());

                return;
            }

            $builder->whereRaw('1 = 0');
        });
    }
}
