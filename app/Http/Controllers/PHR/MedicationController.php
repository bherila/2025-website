<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\StoreMedicationRequest;
use App\Models\PhrMedication;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class MedicationController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $medications = PhrMedication::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderBy('status')
            ->orderByDesc('started_on')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrMedication $m): array => $this->payload($m))
            ->values();

        return response()->json([
            'medications' => $medications,
            'can_manage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }

    public function store(StoreMedicationRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $medication = PhrMedication::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['medication' => $this->payload($medication)], 201);
    }

    public function show(Request $request, int $patient, int $medication): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $resolved = PhrMedication::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($medication);

        return response()->json(['medication' => $this->payload($resolved)]);
    }

    public function update(StoreMedicationRequest $request, int $patient, int $medication): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $resolved = PhrMedication::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($medication);
        $resolved->update($request->validated());

        return response()->json(['medication' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $medication): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        PhrMedication::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($medication)
            ->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrMedication $m): array
    {
        return [
            'id' => $m->id,
            'patient_id' => $m->patient_id,
            'user_id' => $m->user_id,
            'name' => $m->name,
            'rxnorm_code' => $m->rxnorm_code,
            'dose' => $m->dose,
            'dose_unit' => $m->dose_unit,
            'route' => $m->route,
            'frequency' => $m->frequency,
            'started_on' => $m->started_on?->toDateString(),
            'ended_on' => $m->ended_on?->toDateString(),
            'status' => $m->status,
            'prescriber_name' => $m->prescriber_name,
            'reason_for_use' => $m->reason_for_use,
            'raw_text' => $m->raw_text,
            'created_at' => $m->created_at?->toDateTimeString(),
            'updated_at' => $m->updated_at?->toDateTimeString(),
        ];
    }
}
