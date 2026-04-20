<?php

namespace App\Models\FinanceTool;

use Database\Factories\FinanceTool\UserTaxStateFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * @property int $id
 * @property int $user_id
 * @property int $tax_year
 * @property string $state_code Two-letter state abbreviation (e.g. 'CA', 'NY')
 */
class UserTaxState extends Model
{
    /** @use HasFactory<UserTaxStateFactory> */
    use HasFactory;

    protected $table = 'fin_user_tax_states';

    protected $fillable = ['user_id', 'tax_year', 'state_code'];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
        ];
    }
}
