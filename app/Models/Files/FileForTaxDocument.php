<?php

namespace App\Models\Files;

use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Traits\HasFileStorage;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class FileForTaxDocument extends Model
{
    use HasFileStorage, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'fin_tax_documents';

    public const FORM_TYPES = ['w2', 'w2c', '1099_int', '1099_int_c', '1099_div', '1099_div_c'];

    public const W2_FORM_TYPES = ['w2', 'w2c'];

    public const ACCOUNT_FORM_TYPES = ['1099_int', '1099_int_c', '1099_div', '1099_div_c'];

    protected $fillable = [
        'user_id',
        'tax_year',
        'form_type',
        'employment_entity_id',
        'account_id',
        'original_filename',
        'stored_filename',
        's3_path',
        'mime_type',
        'file_size_bytes',
        'file_hash',
        'uploaded_by_user_id',
        'notes',
        'is_reconciled',
    ];

    protected $casts = [
        'file_size_bytes' => 'integer',
        'is_reconciled' => 'boolean',
        'tax_year' => 'integer',
        'download_history' => 'array',
    ];

    protected $appends = ['human_file_size', 'download_count'];

    public function employmentEntity(): BelongsTo
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'employment_entity_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'account_id', 'acct_id');
    }

    public static function generateS3Path(int $userId, string $storedFilename): string
    {
        return "tax_docs/{$userId}/{$storedFilename}";
    }
}
