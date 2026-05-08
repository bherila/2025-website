<?php

namespace App\Models\ClientManagement;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientCompanyActivity extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'client_company_activity';

    protected $fillable = [
        'client_company_id',
        'actor_user_id',
        'action',
        'subject_type',
        'subject_id',
        'payload',
    ];

    protected $casts = [
        'actor_user_id' => 'integer',
        'payload' => 'array',
    ];

    /**
     * @return BelongsTo<ClientCompany, $this>
     */
    public function clientCompany(): BelongsTo
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public static function record(
        ClientCompany $company,
        string $action,
        ?Model $subject = null,
        array $payload = [],
        ?int $actorUserId = null,
    ): self {
        return self::create([
            'client_company_id' => $company->id,
            'actor_user_id' => $actorUserId ?? auth()->id(),
            'action' => $action,
            'subject_type' => $subject ? $subject::class : null,
            'subject_id' => $subject?->getKey(),
            'payload' => $payload,
        ]);
    }
}
