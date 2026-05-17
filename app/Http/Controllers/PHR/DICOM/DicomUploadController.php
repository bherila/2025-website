<?php

namespace App\Http\Controllers\PHR\DICOM;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\ResolvesPHRPatientAccess;
use App\Http\Requests\PHR\DICOM\StoreDicomUploadRequest;
use App\Models\PhrDicomUpload;
use App\Services\PHR\DICOM\DicomUploadProcessor;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\UploadedFile;

class DicomUploadController extends Controller
{
    use ResolvesPHRPatientAccess;

    public function __construct(private readonly DicomUploadProcessor $uploadProcessor) {}

    public function store(StoreDicomUploadRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $files = $this->uploadedFiles($request->file('files', []));
        $relativePaths = array_values($request->input('relative_paths', []));
        $rootName = $request->string('root_name')->trim()->value() ?: $this->inferRootName($relativePaths);

        $upload = $this->uploadProcessor->process($resolvedPatient, $userId, $files, $relativePaths, $rootName);

        return response()->json(['upload' => $this->uploadPayload($upload)], 201);
    }

    /**
     * @param  UploadedFile|array<int, UploadedFile>|null  $fileInput
     * @return list<UploadedFile>
     */
    private function uploadedFiles(UploadedFile|array|null $fileInput): array
    {
        $files = is_array($fileInput) ? $fileInput : [$fileInput];

        return array_values(array_filter($files, fn (mixed $file): bool => $file instanceof UploadedFile));
    }

    /**
     * @param  array<int, mixed>  $relativePaths
     */
    private function inferRootName(array $relativePaths): ?string
    {
        $firstPath = (string) ($relativePaths[0] ?? '');
        $segments = array_values(array_filter(explode('/', str_replace('\\', '/', $firstPath))));

        return count($segments) > 1 ? $segments[0] : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function uploadPayload(PhrDicomUpload $upload): array
    {
        return [
            'id' => $upload->id,
            'patient_id' => $upload->patient_id,
            'uploaded_by_user_id' => $upload->uploaded_by_user_id,
            'status' => $upload->status,
            'original_root_name' => $upload->original_root_name,
            'total_files' => $upload->total_files,
            'stored_files' => $upload->stored_files,
            'skipped_files' => $upload->skipped_files,
            'total_bytes' => $upload->total_bytes,
            'stored_bytes' => $upload->stored_bytes,
            'manifest_json' => $upload->manifest_json,
            'skipped_files_json' => $upload->skipped_files_json,
            'created_at' => $upload->created_at?->toDateTimeString(),
            'updated_at' => $upload->updated_at?->toDateTimeString(),
        ];
    }
}
