<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\StoreLabResultRequest;
use App\Models\PhrLabResult;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LabResultController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $labResults = PhrLabResult::query()
            ->forPatient((int) $resolvedPatient->id)
            ->orderByDesc('result_datetime')
            ->orderByDesc('collection_datetime')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrLabResult $labResult): array => $this->labResultPayload($labResult))
            ->values();

        return response()->json([
            'lab_results' => $labResults,
            'can_manage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }

    public function store(StoreLabResultRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $labResult = PhrLabResult::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['lab_result' => $this->labResultPayload($labResult)], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function labResultPayload(PhrLabResult $labResult): array
    {
        return [
            'id' => $labResult->id,
            'patient_id' => $labResult->patient_id,
            'user_id' => $labResult->user_id,
            'test_name' => $labResult->test_name,
            'collection_datetime' => $labResult->collection_datetime?->toDateTimeString(),
            'result_datetime' => $labResult->result_datetime?->toDateTimeString(),
            'result_status' => $labResult->result_status,
            'ordering_provider' => $labResult->ordering_provider,
            'resulting_lab' => $labResult->resulting_lab,
            'analyte' => $labResult->analyte,
            'value' => $labResult->value,
            'value_numeric' => $labResult->value_numeric,
            'unit' => $labResult->unit,
            'range_min' => $labResult->range_min,
            'range_max' => $labResult->range_max,
            'range_unit' => $labResult->range_unit,
            'reference_range_text' => $labResult->reference_range_text,
            'normal_value' => $labResult->normal_value,
            'abnormal_flag' => $labResult->abnormal_flag,
            'message_from_provider' => $labResult->message_from_provider,
            'result_comment' => $labResult->result_comment,
            'lab_director' => $labResult->lab_director,
            'source' => $labResult->source,
            'notes' => $labResult->notes,
            'created_at' => $labResult->created_at?->toDateTimeString(),
            'updated_at' => $labResult->updated_at?->toDateTimeString(),
        ];
    }
}
