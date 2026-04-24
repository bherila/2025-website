<?php

namespace App\Models\Files;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Jobs\DeleteS3Object;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\Finance\K1LegacyTransformer;
use App\Traits\HasFileStorage;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * @property string|null $misc_routing
 */
class FileForTaxDocument extends Model
{
    use HasFileStorage, SerializesDatesAsLocal;

    protected $table = 'fin_tax_documents';

    /**
     * All valid form_type values for fin_tax_documents.
     *
     * Two categories:
     *   - Container type: `broker_1099` — used for consolidated brokerage PDFs that contain
     *     multiple sub-forms (1099-DIV, 1099-INT, 1099-B) per account. The individual form
     *     types are stored on fin_tax_document_accounts rows, not on the parent document.
     *   - Leaf types: all others — represent a single standalone IRS form.
     *
     * When adding a new form type, update this constant AND ACCOUNT_FORM_TYPES (if account-linked)
     * AND the TypeScript FORM_TYPE_LABELS / ACCOUNT_FORM_TYPES_1099 in tax-document.ts.
     */
    public const FORM_TYPES = ['w2', 'w2c', '1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', '1099_nec', '1099_r', '1099_b', 'broker_1099', 'k1', '1116'];

    /** W-2 family form types (linked to employment entities, not accounts). */
    public const W2_FORM_TYPES = ['w2', 'w2c'];

    /**
     * Form types linked to financial accounts (not employment entities).
     * Includes `broker_1099` — consolidated PDFs are account-linked even though
     * their per-form data lives on fin_tax_document_accounts rows.
     */
    public const ACCOUNT_FORM_TYPES = ['1099_int', '1099_int_c', '1099_div', '1099_div_c', '1099_misc', '1099_nec', '1099_r', '1099_b', 'broker_1099', 'k1', '1116'];

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
        'is_reviewed',
        'misc_routing',
        'genai_job_id',
        'genai_status',
        'parsed_data',
        'download_history',
    ];

    protected $casts = [
        'file_size_bytes' => 'integer',
        'is_reviewed' => 'boolean',
        'tax_year' => 'integer',
        'download_history' => 'array',
    ];

    /**
     * Decode parsed_data as an array, automatically normalising legacy flat-format
     * K-1 records to the canonical schemaVersion structure on read.
     *
     * Writes pass through unchanged so the backfill command can store the
     * already-transformed value without re-encoding it.
     *
     * @return Attribute<array<string,mixed>|null, array<string,mixed>|null>
     */
    protected function parsedData(): Attribute
    {
        return Attribute::make(
            get: function (mixed $value): ?array {
                if ($value === null) {
                    return null;
                }
                $data = is_string($value) ? json_decode($value, true) : $value;
                if (! is_array($data)) {
                    return null;
                }
                if ($this->form_type === 'k1' && K1LegacyTransformer::isLegacy($data)) {
                    return K1LegacyTransformer::transform($data);
                }

                return $data;
            },
            set: fn (mixed $value): ?string => $value !== null ? json_encode($value) : null,
        );
    }

    protected $appends = ['human_file_size', 'download_count'];

    public function employmentEntity(): BelongsTo
    {
        return $this->belongsTo(FinEmploymentEntity::class, 'employment_entity_id');
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(FinAccounts::class, 'account_id', 'acct_id');
    }

    public function genaiJob(): BelongsTo
    {
        return $this->belongsTo(GenAiImportJob::class, 'genai_job_id');
    }

    /** Account links — canonical source of truth for which accounts this document belongs to. */
    public function accountLinks(): HasMany
    {
        return $this->hasMany(TaxDocumentAccount::class, 'tax_document_id')->orderBy('id');
    }

    /**
     * Write-through: propagate notes and/or is_reviewed from the parent document
     * to all account link rows. All provided keys are written as-is, including
     * null/empty values.
     *
     * @param  array<string, mixed>  $updates  Keys: 'notes', 'is_reviewed'
     */
    public function syncToAccountLinks(array $updates): void
    {
        $allowed = array_intersect_key($updates, array_flip(['notes', 'is_reviewed']));
        if (! empty($allowed)) {
            $this->accountLinks()->update($allowed);
        }
    }

    public static function generateS3Path(int $userId, string $storedFilename): string
    {
        return "tax_docs/{$userId}/{$storedFilename}";
    }

    protected static function booted(): void
    {
        // NOTE: this event does not fire for bulk deletes (Model::where()->delete()).
        // Any code that bulk-deletes rows from this table must dispatch DeleteS3Object manually.
        static::deleting(function (self $doc): void {
            if ($doc->s3_path) {
                DeleteS3Object::dispatch($doc->s3_path);
            }
        });
    }
}
