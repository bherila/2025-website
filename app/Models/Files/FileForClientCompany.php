<?php

namespace App\Models\Files;

use App\Models\ClientManagement\ClientCompany;
use App\Traits\HasFileStorage;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FileForClientCompany extends Model
{
    use HasFileStorage, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'files_for_client_companies';

    protected $fillable = [
        'client_company_id',
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
    ];

    protected $appends = ['human_file_size', 'download_count'];

    /**
     * Get the client company this file belongs to.
     */
    public function clientCompany()
    {
        return $this->belongsTo(ClientCompany::class, 'client_company_id');
    }

    /**
     * Generate the S3 path for a client company file.
     */
    public static function generateS3Path(string $companySlug, string $storedFilename): string
    {
        return "{$companySlug}/file/{$storedFilename}";
    }
}
