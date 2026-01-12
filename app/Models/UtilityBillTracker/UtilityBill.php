<?php

namespace App\Models\UtilityBillTracker;

use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UtilityBill extends Model
{
    use SerializesDatesAsLocal;

    protected $table = 'utility_bill';

    protected $fillable = [
        'utility_account_id',
        'bill_start_date',
        'bill_end_date',
        'due_date',
        'total_cost',
        'status',
        'notes',
        'power_consumed_kwh',
        'total_generation_fees',
        'total_delivery_fees',
    ];

    protected function casts(): array
    {
        return [
            'bill_start_date' => 'date',
            'bill_end_date' => 'date',
            'due_date' => 'date',
            'total_cost' => 'decimal:5',
            'power_consumed_kwh' => 'decimal:5',
            'total_generation_fees' => 'decimal:5',
            'total_delivery_fees' => 'decimal:5',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    /**
     * Get the utility account that owns the bill.
     */
    public function utilityAccount(): BelongsTo
    {
        return $this->belongsTo(UtilityAccount::class, 'utility_account_id');
    }
}
