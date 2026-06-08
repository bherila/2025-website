<?php

namespace App\Models\FinanceTool;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\User;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FinDocument extends Model
{
    use SerializesDatesAsLocal;

    public const string KIND_TAX_FORM = 'tax_form';

    public const string KIND_STATEMENT = 'statement';

    public const string KIND_CSV_IMPORT = 'csv_import';

    public const string KIND_JSON_IMPORT = 'json_import';

    public const string KIND_TOON_IMPORT = 'toon_import';

    public const string KIND_MANUAL = 'manual';

    public const array DOCUMENT_KINDS = [
        self::KIND_TAX_FORM,
        self::KIND_STATEMENT,
        self::KIND_CSV_IMPORT,
        self::KIND_JSON_IMPORT,
        self::KIND_TOON_IMPORT,
        self::KIND_MANUAL,
    ];

    protected $table = 'fin_documents';

    protected $fillable = [
        'user_id',
        'document_kind',
        'tax_year',
        'period_start',
        'period_end',
        'original_filename',
        'stored_filename',
        's3_path',
        'mime_type',
        'file_size_bytes',
        'file_hash',
        'uploaded_by_user_id',
        'genai_job_id',
        'genai_status',
        'parsed_data',
        'parsed_data_needs_review',
        'parsed_data_warnings',
        'notes',
        'is_reviewed',
        'download_history',
    ];

    protected $appends = ['human_file_size', 'download_count'];

    protected function casts(): array
    {
        return [
            'tax_year' => 'integer',
            'period_start' => 'date',
            'period_end' => 'date',
            'file_size_bytes' => 'integer',
            'parsed_data' => 'array',
            'parsed_data_needs_review' => 'boolean',
            'parsed_data_warnings' => 'array',
            'is_reviewed' => 'boolean',
            'download_history' => 'array',
        ];
    }

    public static function generateS3Path(int $userId, string $storedFilename, string $documentKind): string
    {
        if ($documentKind === self::KIND_TAX_FORM) {
            return FileForTaxDocument::generateS3Path($userId, $storedFilename);
        }

        return "fin_documents/{$userId}/{$documentKind}/{$storedFilename}";
    }

    /**
     * Validate that an s3_path belongs to the expected owner/kind prefix and is
     * a direct (non-traversal) filename within that prefix.
     *
     * Used by FinanceDocumentController::download(), FileController::viewStatementPdf(),
     * and FinanceDocumentController::validateS3Key() so the check cannot drift.
     */
    public static function isValidS3PathForOwner(string $s3Path, int $userId, string $documentKind): bool
    {
        if ($s3Path === '') {
            return false;
        }

        $expectedPrefix = self::generateS3Path($userId, '', $documentKind);
        if (! str_starts_with($s3Path, $expectedPrefix)) {
            return false;
        }

        $storedFilename = basename($s3Path);
        $keySuffix = substr($s3Path, strlen($expectedPrefix));

        return $storedFilename !== ''
            && $storedFilename !== '.'
            && $storedFilename !== '..'
            && $keySuffix === $storedFilename;
    }

    public static function generateStoredFilename(string $originalFilename): string
    {
        $datePart = now()->format('Y.m.d');
        $randomPart = Str::lower(Str::random(5));

        return $datePart.' '.$randomPart.' '.$originalFilename;
    }

    public function recordDownload(?int $userId = null): void
    {
        DB::transaction(function () use ($userId): void {
            $document = self::query()
                ->whereKey($this->getKey())
                ->lockForUpdate()
                ->first();

            if (! $document instanceof self) {
                return;
            }

            $history = $document->getAttribute('download_history');
            if (! is_array($history)) {
                $history = [];
            }

            $history[] = [
                'user_id' => $userId ?? Auth::id(),
                'downloaded_at' => now()->toIso8601String(),
            ];

            $document->setAttribute('download_history', $history);
            $document->save();
            $this->setRawAttributes($document->getAttributes(), true);
        });
    }

    public function getHumanFileSizeAttribute(): string
    {
        $bytes = (int) ($this->getAttribute('file_size_bytes') ?? 0);

        if ($bytes >= 1073741824) {
            return number_format($bytes / 1073741824, 2).' GB';
        }

        if ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 2).' MB';
        }

        if ($bytes >= 1024) {
            return number_format($bytes / 1024, 2).' KB';
        }

        return $bytes.' bytes';
    }

    public function getDownloadCountAttribute(): int
    {
        $history = $this->getAttribute('download_history');

        return is_array($history) ? count($history) : 0;
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }

    /** @return BelongsTo<GenAiImportJob, $this> */
    public function genaiJob(): BelongsTo
    {
        return $this->belongsTo(GenAiImportJob::class, 'genai_job_id');
    }

    /** @return HasMany<FinDocumentAccount, $this> */
    public function accounts(): HasMany
    {
        return $this->hasMany(FinDocumentAccount::class, 'document_id')->orderBy('id');
    }

    /** @return HasOne<FileForTaxDocument, $this> */
    public function taxDocument(): HasOne
    {
        return $this->hasOne(FileForTaxDocument::class, 'document_id');
    }

    /** @return HasMany<FinStatement, $this> */
    public function statements(): HasMany
    {
        return $this->hasMany(FinStatement::class, 'document_id');
    }

    /** @return HasMany<FinAccountLot, $this> */
    public function lots(): HasMany
    {
        return $this->hasMany(FinAccountLot::class, 'document_id');
    }
}
