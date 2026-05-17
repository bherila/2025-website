<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\ResolvesPHRPatientAccess;
use App\Http\Requests\PHR\StoreProcedureRequest;
use App\Models\PhrProcedure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ProcedureController extends Controller
{
    use ResolvesPHRPatientAccess;

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);

        $procedures = PhrProcedure::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderByDesc('performed_at')
            ->orderByDesc('performed_on')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrProcedure $p): array => $this->payload($p))
            ->values();

        return response()->json(['procedures' => $procedures]);
    }

    public function store(StoreProcedureRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $procedure = PhrProcedure::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $userId,
            ...$request->validated(),
        ]);

        return response()->json(['procedure' => $this->payload($procedure)], 201);
    }

    public function update(StoreProcedureRequest $request, int $patient, int $procedure): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $resolved = PhrProcedure::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($procedure);
        $resolved->update($request->validated());

        return response()->json(['procedure' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $procedure): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

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
            'created_at' => $p->created_at?->toDateTimeString(),
            'updated_at' => $p->updated_at?->toDateTimeString(),
        ];
    }
}
