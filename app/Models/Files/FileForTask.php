<?php

namespace App\Models\Files;

use App\Models\ClientManagement\ClientTask;
use App\Traits\HasFileStorage;
use App\Traits\SerializesDatesAsLocal;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class FileForTask extends Model
{
    use HasFileStorage, SerializesDatesAsLocal, SoftDeletes;

    protected $table = 'files_for_tasks';

    protected $fillable = [
        'task_id',
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
     * Get the task this file belongs to.
     */
    public function task()
    {
        return $this->belongsTo(ClientTask::class, 'task_id');
    }

    /**
     * Generate the S3 path for a task file.
     */
    public static function generateS3Path(string $companySlug, string $projectSlug, int $taskId, string $storedFilename): string
    {
        return "{$companySlug}/project/{$projectSlug}/task/{$taskId}/{$storedFilename}";
    }
}
