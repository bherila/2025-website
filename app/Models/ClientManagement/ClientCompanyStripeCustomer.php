<?php

namespace App\Models\ClientManagement;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\ClientManagement\ClientCompanyStripeCustomerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientCompanyStripeCustomer extends Model
{
    /** @use HasFactory<ClientCompanyStripeCustomerFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'client_company_id',
        'stripe_customer_id',
        'created_by',
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
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
