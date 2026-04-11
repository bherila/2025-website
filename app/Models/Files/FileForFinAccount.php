<?php

namespace App\Models\Files;

use App\Jobs\DeleteS3Object;
use App\Models\FinanceTool\FinAccounts;
use App\Traits\HasFileStorage;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;

class FileForFinAccount extends Model
{
    use HasFileStorage, SerializesDatesAsLocal;

    protected $table = 'files_for_fin_accounts';

    protected $fillable = [
        'acct_id',
        'statement_id',
        'file_hash',
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
        'file_hash' => 'string',
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
     * Uses the user ID as the path prefix (not the account ID) so that files are
     * stored per-user and can be shared/linked across multiple accounts.
     */
    public static function generateS3Path(int $userId, string $storedFilename): string
    {
        return "fin_acct/{$userId}/{$storedFilename}";
    }

    protected static function booted(): void
    {
        // NOTE: this event does not fire for bulk deletes (Model::where()->delete()).
        // Any code that bulk-deletes rows from this table must dispatch DeleteS3Object manually.
        static::deleting(function (self $file): void {
            if ($file->s3_path) {
                DeleteS3Object::dispatch($file->s3_path);
            }
        });
    }
}
