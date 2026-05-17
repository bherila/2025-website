<?php

namespace App\Models;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property int $patient_id
 * @property int $user_id
 * @property int|null $uploaded_by_user_id
 * @property int|null $genai_job_id
 * @property string|null $title
 * @property string $document_type
 * @property string|null $original_filename
 * @property string $storage_disk
 * @property string|null $storage_path
 * @property string|null $mime_type
 * @property int $file_size_bytes
 * @property string|null $sha256
 * @property string|null $extracted_text
 * @property string|null $summary
 * @property string|null $source
 * @property string|null $import_source
 * @property string|null $external_id
 * @property Carbon|null $imported_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 */
class PhrDocument extends Model
{
    use SerializesDatesAsLocal;

    protected $fillable = [
        'patient_id',
        'user_id',
        'uploaded_by_user_id',
        'genai_job_id',
        'title',
        'document_type',
        'original_filename',
        'storage_disk',
        'storage_path',
        'mime_type',
        'file_size_bytes',
        'sha256',
        'extracted_text',
        'summary',
        'source',
        'import_source',
        'external_id',
        'imported_at',
    ];

    protected function casts(): array
    {
        return [
            'patient_id' => 'integer',
            'user_id' => 'integer',
            'uploaded_by_user_id' => 'integer',
            'genai_job_id' => 'integer',
            'file_size_bytes' => 'integer',
            'imported_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<PhrPatient, $this> */
    public function patient(): BelongsTo
    {
        return $this->belongsTo(PhrPatient::class, 'patient_id');
    }

    /** @return BelongsTo<User, $this> */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /** @return BelongsTo<User, $this> */
    public function uploadedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by_user_id');
    }

    /** @return BelongsTo<GenAiImportJob, $this> */
    public function genAiJob(): BelongsTo
    {
        return $this->belongsTo(GenAiImportJob::class, 'genai_job_id');
    }
}
