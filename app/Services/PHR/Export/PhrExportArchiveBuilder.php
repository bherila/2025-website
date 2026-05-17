<?php

namespace App\Services\PHR\Export;

use App\Models\PhrDicomFile;
use App\Models\PhrDocument;
use Illuminate\Support\Facades\Storage;
use ZipArchive;

class PhrExportArchiveBuilder
{
    /**
     * @param  array<string, mixed>  $data
     * @param  array<string, string>  $artifacts
     */
    public function writeZip(string $targetPath, array $data, array $artifacts): void
    {
        $zip = new ZipArchive;
        if ($zip->open($targetPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException("Unable to create ZIP at {$targetPath}");
        }

        try {
            foreach ($artifacts as $path => $contents) {
                $zip->addFromString($path, $contents);
            }

            foreach ($data['documents'] as $document) {
                if (! $document instanceof PhrDocument || ! $document->storage_path) {
                    continue;
                }

                $this->addStorageFile(
                    $zip,
                    $document->storage_disk,
                    $document->storage_path,
                    'documents/'.$document->id.'-'.$this->safeFilename($document->original_filename ?? ('document-'.$document->id))
                );
            }

            foreach ($data['dicom_files'] as $file) {
                if (! $file instanceof PhrDicomFile) {
                    continue;
                }

                $studyUid = $file->instance?->study->study_instance_uid
                    ?? ($file->metadata_json['study_instance_uid'] ?? null)
                    ?? 'unknown-study';

                $this->addStorageFile(
                    $zip,
                    'phr_dicom',
                    $file->r2_key,
                    'dicom/studies/'.$this->safePath((string) $studyUid).'/'.$this->safePath($file->original_relative_path)
                );
            }
        } finally {
            $zip->close();
        }
    }

    private function addStorageFile(ZipArchive $zip, string $disk, string $storagePath, string $zipPath): void
    {
        if (! Storage::disk($disk)->exists($storagePath)) {
            return;
        }

        $contents = Storage::disk($disk)->get($storagePath);
        if (! is_string($contents)) {
            return;
        }

        $zip->addFromString($zipPath, $contents);
    }

    private function safeFilename(string $filename): string
    {
        $safe = preg_replace('/[^\w.\-]+/', '_', $filename) ?: 'document';

        return trim($safe, '_') ?: 'document';
    }

    private function safePath(string $path): string
    {
        $segments = array_filter(explode('/', str_replace('\\', '/', $path)), static fn (string $segment): bool => $segment !== '' && $segment !== '.' && $segment !== '..');

        return implode('/', array_map(fn (string $segment): string => $this->safeFilename($segment), $segments));
    }
}
