<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\StoreConditionRequest;
use App\Models\PhrCondition;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ConditionController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $conditions = PhrCondition::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderBy('clinical_status')
            ->orderByDesc('onset_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrCondition $c): array => $this->payload($c))
            ->values();

        return response()->json([
            'conditions' => $conditions,
            'can_manage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }

    public function store(StoreConditionRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $condition = PhrCondition::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['condition' => $this->payload($condition)], 201);
    }

    public function show(Request $request, int $patient, int $condition): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $resolved = PhrCondition::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($condition);

        return response()->json(['condition' => $this->payload($resolved)]);
    }

    public function update(StoreConditionRequest $request, int $patient, int $condition): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $resolved = PhrCondition::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($condition);
        $resolved->update($request->validated());

        return response()->json(['condition' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $condition): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        PhrCondition::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($condition)
            ->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrCondition $c): array
    {
        return [
            'id' => $c->id,
            'patient_id' => $c->patient_id,
            'user_id' => $c->user_id,
            'name' => $c->name,
            'icd10_code' => $c->icd10_code,
            'snomed_code' => $c->snomed_code,
            'onset_date' => $c->onset_date?->toDateString(),
            'abated_date' => $c->abated_date?->toDateString(),
            'clinical_status' => $c->clinical_status,
            'verification_status' => $c->verification_status,
            'severity' => $c->severity,
            'notes' => $c->notes,
            'raw_text' => $c->raw_text,
            'created_at' => $c->created_at?->toDateTimeString(),
            'updated_at' => $c->updated_at?->toDateTimeString(),
        ];
    }
}
