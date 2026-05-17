<?php

namespace App\Services\PHR\DICOM;

use App\Models\PhrDicomFile;
use App\Models\PhrDicomInstance;
use App\Models\PhrDicomSeries;
use App\Models\PhrDicomStudy;
use App\Models\PhrDicomUpload;
use App\Models\PhrPatient;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class DicomUploadProcessor
{
    /**
     * @var array<int, string>
     */
    private const AUXILIARY_EXTENSIONS = [
        'bat',
        'bmp',
        'cmd',
        'com',
        'css',
        'dll',
        'doc',
        'docx',
        'exe',
        'gif',
        'htm',
        'html',
        'ico',
        'inf',
        'ini',
        'jpg',
        'jpeg',
        'js',
        'lnk',
        'msi',
        'pdf',
        'png',
        'rtf',
        'txt',
        'url',
        'xml',
    ];

    public const DISK = 'phr_dicom';

    public function __construct(private readonly DicomMetadataParser $metadataParser) {}

    /**
     * @param  list<UploadedFile>  $files
     * @param  list<string|null>  $relativePaths
     */
    public function process(PhrPatient $patient, int $uploadedByUserId, array $files, array $relativePaths, ?string $rootName): PhrDicomUpload
    {
        $storagePrefix = sprintf('phr/dicom/patients/%d/uploads/%s', $patient->id, Str::uuid()->toString());

        $upload = PhrDicomUpload::create([
            'patient_id' => $patient->id,
            'uploaded_by_user_id' => $uploadedByUserId,
            'status' => PhrDicomUpload::STATUS_PENDING,
            'original_root_name' => $rootName,
            'total_files' => count($files),
            'stored_files' => 0,
            'skipped_files' => 0,
            'total_bytes' => 0,
            'stored_bytes' => 0,
            'r2_prefix' => $storagePrefix,
            'manifest_json' => [
                'stored_paths' => [],
                'dicomdir_paths' => [],
                'study_uids' => [],
                'series_uids' => [],
                'instance_uids' => [],
            ],
            'skipped_files_json' => [],
        ]);

        try {
            return $this->processFiles($patient, $upload, $files, $relativePaths, $storagePrefix);
        } catch (Throwable $caught) {
            $this->failUpload($upload, $caught->getMessage());
            throw $caught;
        }
    }

    /**
     * Mark an upload as failed and reclaim everything it persisted.
     *
     * Used by:
     * - the rollback path in process() when a file in the loop throws
     * - the phr:dicom:gc artisan command when a pending upload times out
     *
     * Cleanup is best-effort: storage and DB errors are logged but the upload
     * row is still transitioned to STATUS_FAILED so the caller can surface it.
     */
    public function failUpload(PhrDicomUpload $upload, string $reason): void
    {
        $disk = $this->disk();

        try {
            $disk->deleteDirectory($upload->r2_prefix);
        } catch (Throwable $cleanupError) {
            Log::warning('phr.dicom.cleanup_delete_prefix_failed', [
                'upload_id' => $upload->id,
                'prefix' => $upload->r2_prefix,
                'error' => $cleanupError->getMessage(),
            ]);
        }

        // phr_dicom_instances and phr_dicom_files cascade on upload delete in
        // the schema, but we keep the upload row around for audit, so cascade
        // child rows explicitly. Empty studies/series created by this failed
        // upload are also removed so users do not see phantom imaging rows.
        PhrDicomInstance::query()->where('upload_id', $upload->id)->delete();
        PhrDicomFile::query()->where('upload_id', $upload->id)->delete();
        PhrDicomSeries::query()
            ->where('patient_id', $upload->patient_id)
            ->whereDoesntHave('instances')
            ->delete();
        PhrDicomStudy::query()
            ->where('patient_id', $upload->patient_id)
            ->where('upload_id', $upload->id)
            ->whereDoesntHave('instances')
            ->delete();

        $upload->update([
            'status' => PhrDicomUpload::STATUS_FAILED,
            'error_message' => Str::limit($reason, 1000),
        ]);
    }

    public function disk(): Filesystem
    {
        return Storage::disk(self::DISK);
    }

    /**
     * @param  list<UploadedFile>  $files
     * @param  list<string|null>  $relativePaths
     */
    private function processFiles(PhrPatient $patient, PhrDicomUpload $upload, array $files, array $relativePaths, string $storagePrefix): PhrDicomUpload
    {
        $manifest = $upload->manifest_json ?? [];
        $skippedFiles = [];
        $storedFiles = 0;
        $storedBytes = 0;
        $totalBytes = 0;
        $relativePathCounts = [];

        foreach ($files as $index => $file) {
            $relativePath = $this->uniqueRelativePath(
                $this->sanitizeRelativePath($relativePaths[$index] ?? null, $file->getClientOriginalName(), $index),
                $relativePathCounts,
            );
            $fileSize = (int) $file->getSize();
            $totalBytes += $fileSize;

            if (! $file->isValid()) {
                $skippedFiles[] = $this->skipEntry($relativePath, 'upload_error');

                continue;
            }

            if ($this->isAuxiliaryFile($relativePath)) {
                $skippedFiles[] = $this->skipEntry($relativePath, 'auxiliary_file');

                continue;
            }

            $realPath = $file->getRealPath();
            if ($realPath === false) {
                $skippedFiles[] = $this->skipEntry($relativePath, 'missing_temp_file');

                continue;
            }

            $parsed = $this->metadataParser->parse($realPath);
            if (! $parsed['is_dicom']) {
                $skippedFiles[] = $this->skipEntry($relativePath, 'not_dicom');

                continue;
            }

            if ($parsed['is_image_instance'] && $this->hasImageInstance($patient->id, $parsed['normalized'])) {
                $skippedFiles[] = $this->skipEntry($relativePath, 'duplicate_sop_instance');

                continue;
            }

            $sha256 = hash_file('sha256', $realPath);
            if ($sha256 === false) {
                throw new RuntimeException("Unable to hash DICOM file [{$relativePath}].");
            }

            $storageKey = $this->storageKey($storagePrefix, $relativePath);
            $this->storeFile($realPath, $storageKey);

            $fileKind = $this->isDicomdirPath($relativePath) ? PhrDicomFile::KIND_DICOMDIR : PhrDicomFile::KIND_DICOM;
            $dicomFile = PhrDicomFile::create([
                'patient_id' => $patient->id,
                'upload_id' => $upload->id,
                'file_kind' => $fileKind,
                'r2_key' => $storageKey,
                'original_relative_path' => $relativePath,
                'original_path_hash' => hash('sha256', $relativePath),
                'original_filename' => basename($relativePath),
                'mime_type' => $file->getClientMimeType() ?: 'application/dicom',
                'file_size_bytes' => $fileSize,
                'sha256' => $sha256,
                'metadata_json' => $parsed['metadata'],
            ]);

            $storedFiles++;
            $storedBytes += $fileSize;
            $manifest['stored_paths'][] = $relativePath;

            if ($fileKind === PhrDicomFile::KIND_DICOMDIR) {
                $manifest['dicomdir_paths'][] = $relativePath;
            }

            if ($parsed['is_image_instance']) {
                $this->upsertImageInstance($patient, $upload, $dicomFile, $parsed['metadata'], $parsed['normalized']);
                $manifest['study_uids'][] = $parsed['normalized']['study_instance_uid'];
                $manifest['series_uids'][] = $parsed['normalized']['series_instance_uid'];
                $manifest['instance_uids'][] = $parsed['normalized']['sop_instance_uid'];
            }
        }

        $upload->update([
            'status' => PhrDicomUpload::STATUS_PROCESSED,
            'total_files' => count($files),
            'stored_files' => $storedFiles,
            'skipped_files' => count($skippedFiles),
            'total_bytes' => $totalBytes,
            'stored_bytes' => $storedBytes,
            'manifest_json' => $this->uniqueManifest($manifest),
            'skipped_files_json' => $skippedFiles,
        ]);

        return $upload->refresh()->load(['files.instance', 'studies.series.instances.file']);
    }

    /**
     * @param  array<string, mixed>  $metadata
     * @param  array<string, mixed>  $normalized
     */
    private function upsertImageInstance(PhrPatient $patient, PhrDicomUpload $upload, PhrDicomFile $file, array $metadata, array $normalized): void
    {
        $studyUid = (string) $normalized['study_instance_uid'];
        $seriesUid = (string) $normalized['series_instance_uid'];
        $sopUid = (string) $normalized['sop_instance_uid'];
        $modality = $this->nullableString($normalized['modality'] ?? null);

        if ($this->hasImageInstance($patient->id, $normalized)) {
            return;
        }

        $existingStudy = PhrDicomStudy::query()
            ->where('patient_id', $patient->id)
            ->where('study_instance_uid', $studyUid)
            ->first();

        // upload_id is set only on the original creation; re-uploads of the
        // same study_instance_uid must not overwrite the originating upload.
        $studyAttributes = [
            'study_date' => $normalized['study_date'],
            'study_time' => $normalized['study_time'],
            'accession_number' => $normalized['accession_number'],
            'description' => $normalized['study_description'],
            'modalities' => $this->mergeModalities($existingStudy?->modalities, $modality),
            'metadata_json' => $metadata,
        ];

        if ($existingStudy === null) {
            $studyAttributes['upload_id'] = $upload->id;
        }

        $study = PhrDicomStudy::updateOrCreate(
            [
                'patient_id' => $patient->id,
                'study_instance_uid' => $studyUid,
            ],
            $studyAttributes,
        );

        $series = PhrDicomSeries::updateOrCreate(
            [
                'study_id' => $study->id,
                'series_instance_uid' => $seriesUid,
            ],
            [
                'patient_id' => $patient->id,
                'modality' => $modality,
                'series_number' => $normalized['series_number'],
                'description' => $normalized['series_description'],
                'body_part' => $normalized['body_part'],
                'metadata_json' => $metadata,
            ],
        );

        PhrDicomInstance::create([
            'patient_id' => $patient->id,
            'study_id' => $study->id,
            'series_id' => $series->id,
            'upload_id' => $upload->id,
            'file_id' => $file->id,
            'sop_instance_uid' => $sopUid,
            'sop_class_uid' => $normalized['sop_class_uid'],
            'instance_number' => $normalized['instance_number'],
            'transfer_syntax_uid' => $normalized['transfer_syntax_uid'],
            'rows' => $normalized['rows'],
            'columns' => $normalized['columns'],
            'number_of_frames' => $normalized['number_of_frames'],
            'metadata_json' => $metadata,
        ]);
    }

    private function storeFile(string $realPath, string $storageKey): void
    {
        $stream = fopen($realPath, 'rb');
        if ($stream === false) {
            throw new RuntimeException("Unable to open DICOM file [{$realPath}].");
        }

        try {
            if (! Storage::disk(self::DISK)->put($storageKey, $stream)) {
                throw new RuntimeException("Unable to store DICOM object [{$storageKey}].");
            }
        } finally {
            fclose($stream);
        }
    }

    /**
     * @param  array<string, mixed>  $normalized
     */
    private function hasImageInstance(int $patientId, array $normalized): bool
    {
        $sopInstanceUid = $this->nullableString($normalized['sop_instance_uid'] ?? null);

        return $sopInstanceUid !== null
            && PhrDicomInstance::query()
                ->where('patient_id', $patientId)
                ->where('sop_instance_uid', $sopInstanceUid)
                ->exists();
    }

    private function sanitizeRelativePath(?string $path, ?string $fallbackName, int $index): string
    {
        $relativePath = $this->sanitizePathParts($path);
        if ($relativePath === '') {
            $fallbackPath = $this->sanitizePathParts($fallbackName);
            $relativePath = $fallbackPath === '' ? 'dicom-file-'.($index + 1) : $fallbackPath;
        }

        if (strlen($relativePath) <= 1000) {
            return $relativePath;
        }

        return hash('sha256', $relativePath).'/'.substr(basename($relativePath), 0, 180);
    }

    /**
     * @param  array<string, int>  $relativePathCounts
     */
    private function uniqueRelativePath(string $relativePath, array &$relativePathCounts): string
    {
        $count = ($relativePathCounts[$relativePath] ?? 0) + 1;
        $relativePathCounts[$relativePath] = $count;

        if ($count === 1) {
            return $relativePath;
        }

        $directory = trim(dirname($relativePath), '.');
        $filename = basename($relativePath);
        $extension = pathinfo($filename, PATHINFO_EXTENSION);
        $basename = $extension === ''
            ? $filename
            : substr($filename, 0, -(strlen($extension) + 1));

        $deduplicated = $extension === ''
            ? sprintf('%s-%d', $basename, $count)
            : sprintf('%s-%d.%s', $basename, $count, $extension);

        return $directory === '' || $directory === '/'
            ? $deduplicated
            : $directory.'/'.$deduplicated;
    }

    private function sanitizePathParts(?string $path): string
    {
        $rawPath = trim(str_replace('\\', '/', (string) $path));
        $parts = [];

        foreach (explode('/', $rawPath) as $part) {
            $part = preg_replace('/[\x00-\x1F\x7F]/', '', $part) ?? '';
            $part = trim(str_replace([':', '*', '?', '"', '<', '>', '|'], '_', $part));

            if ($part === '' || $part === '.' || $part === '..') {
                continue;
            }

            $parts[] = $part;
        }

        return implode('/', $parts);
    }

    private function isAuxiliaryFile(string $relativePath): bool
    {
        if ($this->isDicomdirPath($relativePath)) {
            return false;
        }

        $extension = strtolower(pathinfo($relativePath, PATHINFO_EXTENSION));
        if ($extension !== '' && in_array($extension, self::AUXILIARY_EXTENSIONS, true)) {
            return true;
        }

        $segments = array_map('strtolower', explode('/', $relativePath));

        return count(array_intersect($segments, ['autorun', 'cdsetup', 'icons', 'setup', 'viewer'])) > 0
            && ! in_array($extension, ['', 'dcm', 'dicom'], true);
    }

    private function isDicomdirPath(string $relativePath): bool
    {
        return strtoupper(basename($relativePath)) === 'DICOMDIR';
    }

    private function storageKey(string $storagePrefix, string $relativePath): string
    {
        return $storagePrefix.'/'.$relativePath;
    }

    /**
     * @return array{path: string, reason: string}
     */
    private function skipEntry(string $path, string $reason): array
    {
        return [
            'path' => $path,
            'reason' => $reason,
        ];
    }

    /**
     * @param  array<string, mixed>  $manifest
     * @return array<string, mixed>
     */
    private function uniqueManifest(array $manifest): array
    {
        foreach (['stored_paths', 'dicomdir_paths', 'study_uids', 'series_uids', 'instance_uids'] as $key) {
            $manifest[$key] = array_values(array_unique(array_filter($manifest[$key] ?? [])));
        }

        return $manifest;
    }

    private function mergeModalities(?string $existingModalities, ?string $modality): ?string
    {
        $modalities = array_filter(explode('\\', (string) $existingModalities));

        if ($modality !== null) {
            $modalities[] = $modality;
        }

        $unique = array_values(array_unique($modalities));

        return $unique === [] ? null : implode('\\', $unique);
    }

    private function nullableString(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }
}
