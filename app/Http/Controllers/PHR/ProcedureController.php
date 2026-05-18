<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\StoreProcedureRequest;
use App\Models\PhrProcedure;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ProcedureController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $procedures = PhrProcedure::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderByDesc('performed_at')
            ->orderByDesc('performed_on')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrProcedure $p): array => $this->payload($p))
            ->values();

        return response()->json([
            'procedures' => $procedures,
            'can_manage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }

    public function store(StoreProcedureRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $procedure = PhrProcedure::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['procedure' => $this->payload($procedure)], 201);
    }

    public function show(Request $request, int $patient, int $procedure): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $resolved = PhrProcedure::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($procedure);

        return response()->json(['procedure' => $this->payload($resolved)]);
    }

    public function update(StoreProcedureRequest $request, int $patient, int $procedure): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $resolved = PhrProcedure::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($procedure);
        $resolved->update($request->validated());

        return response()->json(['procedure' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $procedure): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        PhrProcedure::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($procedure)
            ->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrProcedure $p): array
    {
        return [
            'id' => $p->id,
            'patient_id' => $p->patient_id,
            'user_id' => $p->user_id,
            'name' => $p->name,
            'cpt_code' => $p->cpt_code,
            'snomed_code' => $p->snomed_code,
            'performed_at' => $p->performed_at?->toDateTimeString(),
            'performed_on' => $p->performed_on?->toDateString(),
            'performer_name' => $p->performer_name,
            'performer_specialty' => $p->performer_specialty,
            'facility_name' => $p->facility_name,
            'status' => $p->status,
            'reason' => $p->reason,
            'outcome' => $p->outcome,
            'notes' => $p->notes,
            'raw_text' => $p->raw_text,
            'created_at' => $p->created_at?->toDateTimeString(),
            'updated_at' => $p->updated_at?->toDateTimeString(),
        ];
    }
}
