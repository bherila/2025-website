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
 * @property CarbonInterface|null $notification_received_on
 * @property string|null $notification_email_copy
 * @property string|null $class_action_url
 * @property CarbonInterface|null $payment_election_submitted_on
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
        'notification_received_on',
        'notification_email_copy',
        'class_action_url',
        'payment_election_submitted_on',
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
