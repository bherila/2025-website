<?php

namespace App\Models\FinanceTool;

use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Database\Factories\FinanceTool\FinTaxReturnPdfExportFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinTaxReturnPdfExport extends Model
{
    /** @use HasFactory<FinTaxReturnPdfExportFactory> */
    use HasFactory, SerializesDatesAsLocal;

    protected $fillable = [
        'user_id',
        'tax_year',
        'scope',
        'form_ids',
        'mode',
        'status',
        'filename',
        'error_summary',
        'exported_at',
    ];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'form_ids' => 'array',
            'error_summary' => 'array',
            'exported_at' => 'datetime',
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
