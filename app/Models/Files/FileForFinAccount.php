<?php

namespace App\Models\Files;

use App\Models\FinAccounts;
use App\Traits\HasFileStorage;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FileForFinAccount extends Model
{
    use HasFileStorage, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'files_for_fin_accounts';

    protected $fillable = [
        'acct_id',
        'statement_id',
        'original_filename',
        'stored_filename',
        's3_path',
        'mime_type',
        'file_size_bytes',
        'uploaded_by_user_id',
        'download_history',
    ];

    protected $casts = [
        'download_history' => 'array',
        'file_size_bytes' => 'integer',
        'statement_id' => 'integer',
    ];

    protected $appends = ['human_file_size', 'download_count'];

    /**
     * Get the financial account this file belongs to.
     */
    public function account()
    {
        return $this->belongsTo(FinAccounts::class, 'acct_id', 'acct_id');
    }

    /**
     * Generate the S3 path for a financial account file.
     */
    public static function generateS3Path(int $acctId, string $storedFilename): string
    {
        return "fin_acct/{$acctId}/{$storedFilename}";
    }
}
