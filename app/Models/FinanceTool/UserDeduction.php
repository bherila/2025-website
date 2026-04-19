<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $user_id
 * @property int $tax_year
 * @property string $category 'real_estate_tax'|'state_est_tax'|'sales_tax'|'mortgage_interest'|'charitable_cash'|'charitable_noncash'|'other'
 * @property string|null $description
 * @property float $amount
 */
class UserDeduction extends Model
{
    protected $table = 'fin_user_deductions';

    protected $fillable = ['user_id', 'tax_year', 'category', 'description', 'amount'];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'amount' => 'decimal:2',
        ];
    }
}
