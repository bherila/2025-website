<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\StoreOfficeVisitRequest;
use App\Models\PhrOfficeVisit;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class OfficeVisitController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $visits = PhrOfficeVisit::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderByDesc('visit_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrOfficeVisit $v): array => $this->payload($v))
            ->values();

        return response()->json([
            'office_visits' => $visits,
            'can_manage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }

    public function store(StoreOfficeVisitRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $visit = PhrOfficeVisit::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['office_visit' => $this->payload($visit)], 201);
    }

    public function show(Request $request, int $patient, int $visit): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $resolved = PhrOfficeVisit::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($visit);

        return response()->json(['office_visit' => $this->payload($resolved)]);
    }

    public function update(StoreOfficeVisitRequest $request, int $patient, int $visit): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $resolved = PhrOfficeVisit::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($visit);
        $resolved->update($request->validated());

        return response()->json(['office_visit' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $visit): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        PhrOfficeVisit::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($visit)
            ->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrOfficeVisit $v): array
    {
        return [
            'id' => $v->id,
            'patient_id' => $v->patient_id,
            'user_id' => $v->user_id,
            'visit_date' => $v->visit_date?->toDateString(),
            'visit_started_at' => $v->visit_started_at?->toDateTimeString(),
            'visit_ended_at' => $v->visit_ended_at?->toDateTimeString(),
            'visit_type' => $v->visit_type,
            'provider_name' => $v->provider_name,
            'provider_specialty' => $v->provider_specialty,
            'facility_name' => $v->facility_name,
            'chief_complaint' => $v->chief_complaint,
            'assessment' => $v->assessment,
            'plan' => $v->plan,
            'subjective' => $v->subjective,
            'objective' => $v->objective,
            'icd10_codes' => $v->icd10_codes ?? [],
            'cpt_codes' => $v->cpt_codes ?? [],
            'created_at' => $v->created_at?->toDateTimeString(),
            'updated_at' => $v->updated_at?->toDateTimeString(),
        ];
    }
}
