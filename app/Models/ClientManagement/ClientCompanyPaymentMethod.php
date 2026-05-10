<?php

namespace App\Models\ClientManagement;

use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ClientManagement\ClientCompanyPaymentMethodFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class ClientCompanyPaymentMethod extends Model
{
    /** @use HasFactory<ClientCompanyPaymentMethodFactory> */
    use HasFactory, SerializesDatesAsLocal, SoftDeletes;

    protected $fillable = [
        'client_company_id',
        'stripe_payment_method_id',
        'type',
        'brand',
        'last4',
        'exp_month',
        'exp_year',
        'bank_name',
        'is_default',
    ];

    protected $casts = [
        'exp_month' => 'integer',
        'exp_year' => 'integer',
        'is_default' => 'boolean',
    ];

    /**
     * @return BelongsTo<ClientCompany, $this>
     */
    public function clientCompany(): BelongsTo
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * @return array<string, mixed>
     */
    public function toPortalArray(): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'brand' => $this->brand,
            'last4' => $this->last4,
            'exp_month' => $this->exp_month,
            'exp_year' => $this->exp_year,
            'bank_name' => $this->bank_name,
            'is_default' => $this->is_default,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
