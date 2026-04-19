<?php

namespace App\Models\FinanceTool;

use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $user_id
 * @property int $tax_year
 * @property string $state_code Two-letter state abbreviation (e.g. 'CA', 'NY')
 */
class UserTaxState extends Model
{
    protected $table = 'fin_user_tax_states';

    protected $fillable = ['user_id', 'tax_year', 'state_code'];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
        ];
    }
}
