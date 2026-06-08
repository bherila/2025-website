<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\FinanceTool\FinTaxReturnProfileFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinTaxReturnProfile extends Model
{
    /** @use HasFactory<FinTaxReturnProfileFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'tax_year',
        'filing_status',
        'taxpayer_first_name',
        'taxpayer_middle_initial',
        'taxpayer_last_name',
        'taxpayer_ssn',
        'spouse_first_name',
        'spouse_middle_initial',
        'spouse_last_name',
        'spouse_ssn',
        'address_line1',
        'address_line2',
        'city',
        'state',
        'postal_code',
        'country',
        'digital_assets_answer',
        'taxpayer_occupation',
        'spouse_occupation',
        'phone',
        'email',
        'ip_pin',
        'spouse_ip_pin',
        'direct_deposit_routing',
        'direct_deposit_account',
        'direct_deposit_account_type',
        'dependents_json',
        'third_party_designee_json',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'taxpayer_ssn' => 'encrypted',
            'spouse_ssn' => 'encrypted',
            'ip_pin' => 'encrypted',
            'spouse_ip_pin' => 'encrypted',
            'direct_deposit_routing' => 'encrypted',
            'direct_deposit_account' => 'encrypted',
            'dependents_json' => 'array',
            'third_party_designee_json' => 'array',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
