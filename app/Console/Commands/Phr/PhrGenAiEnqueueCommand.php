<?php

namespace App\Console\Commands\Phr;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Services\PHR\Access\PhrPatientAccessService;
use App\Services\PHR\Import\PhrStructuredDataImporter;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

#[Signature('phr:genai:enqueue {--patient= : PHR patient id} {--actor= : Acting user id} {--file= : Local file to enqueue} {--type=phr_document : PHR GenAI job type}')]
#[Description('Submit a local file to the GenAI PHR import queue')]
class PhrGenAiEnqueueCommand extends BasePhrCommand
{
    public function handle(PhrPatientAccessService $accessService): int
    {
        $patient = $this->writeablePatient($accessService);
        $actorId = $this->intOptionRequired('actor');
        $file = $this->fileOptionRequired('file');
        $type = (string) $this->option('type');
        if (! PhrStructuredDataImporter::isPhrJobType($type)) {
            $this->error("Unsupported PHR GenAI job type: {$type}");

            return self::FAILURE;
        }

        $filename = basename($file);
        $s3Key = 'genai-import/'.$actorId.'/'.Str::uuid().'/'.preg_replace('/[^\w.\-]/', '_', $filename);
        Storage::disk('s3')->put($s3Key, file_get_contents($file));

        $job = GenAiImportJob::create([
            'user_id' => $actorId,
            'job_type' => $type,
            'file_hash' => hash_file('sha256', $file),
            'original_filename' => $filename,
            's3_path' => $s3Key,
            'mime_type' => mime_content_type($file) ?: 'application/pdf',
            'file_size_bytes' => filesize($file) ?: 0,
            'context_json' => json_encode(['patient_id' => $patient->id]),
            'status' => 'pending',
        ]);

        ParseImportJob::dispatch($job->id);
        $this->info("Queued GenAI PHR job {$job->id}.");

        return self::SUCCESS;
    }
}
