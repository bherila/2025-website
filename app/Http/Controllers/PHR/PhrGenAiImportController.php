<?php

namespace App\Http\Controllers\PHR;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\AcceptPhrGenAiResultRequest;
use App\Services\PHR\Access\PhrPatientAccessService;
use App\Services\PHR\Import\PhrImportResult;
use App\Services\PHR\Import\PhrStructuredDataImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PhrGenAiImportController extends Controller
{
    public function __construct(
        private PhrPatientAccessService $accessService,
        private PhrStructuredDataImporter $importer,
    ) {}

    public function writablePatients(Request $request): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $patients = $this->accessService
            ->writablePatientsQuery($userId)
            ->orderBy('display_name')
            ->get(['id', 'display_name', 'relationship']);

        return response()->json(['patients' => $patients]);
    }

    public function accept(AcceptPhrGenAiResultRequest $request, int $job, int $result): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $genAiJob = GenAiImportJob::query()
            ->where('id', $job)
            ->where('user_id', $userId)
            ->firstOrFail();

        abort_unless(PhrStructuredDataImporter::isPhrJobType($genAiJob->job_type), 404);

        $context = $genAiJob->getContextArray();
        $patientId = (int) ($context['patient_id'] ?? 0);
        abort_unless($patientId > 0, 422, 'PHR GenAI job is missing patient context.');

        $patient = $this->accessService->writablePatient($patientId, $userId);
        $genAiResult = GenAiImportResult::query()
            ->where('id', $result)
            ->where('job_id', $genAiJob->id)
            ->firstOrFail();

        abort_unless($genAiResult->status !== 'imported', 409, 'This result has already been imported.');

        $payload = $request->payload() ?? $genAiResult->getResultArray();

        if ($genAiJob->job_type === 'phr_document') {
            $this->importer->storeGenAiDocument($patient, $userId, $genAiJob, $payload);
            $importResult = new PhrImportResult(created: 1, documents: 1);
        } else {
            $importResult = $this->importer->importPayload($patient, $userId, $genAiJob->job_type, $payload, [
                'import_source' => 'genai',
                'source' => 'genai',
                'genai_job_id' => $genAiJob->id,
            ]);
        }

        $genAiResult->markImported();

        if (! $genAiJob->results()->where('status', 'pending_review')->exists()) {
            $genAiJob->markImported();
        }

        return response()->json([
            'result' => $genAiResult->refresh(),
            'import' => $importResult->toArray(),
        ]);
    }
}
