<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\ResolvesPHRPatientAccess;
use App\Http\Requests\PHR\StoreImmunizationRequest;
use App\Models\PhrImmunization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ImmunizationController extends Controller
{
    use ResolvesPHRPatientAccess;

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);

        $immunizations = PhrImmunization::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderByDesc('administered_on')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrImmunization $i): array => $this->payload($i))
            ->values();

        return response()->json(['immunizations' => $immunizations]);
    }

    public function store(StoreImmunizationRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $immunization = PhrImmunization::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['immunization' => $this->payload($immunization)], 201);
    }

    public function update(StoreImmunizationRequest $request, int $patient, int $immunization): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $resolved = PhrImmunization::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($immunization);
        $resolved->update($request->validated());

        return response()->json(['immunization' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $immunization): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        PhrImmunization::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($immunization)
            ->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrImmunization $i): array
    {
        return [
            'id' => $i->id,
            'patient_id' => $i->patient_id,
            'user_id' => $i->user_id,
            'vaccine_name' => $i->vaccine_name,
            'cvx_code' => $i->cvx_code,
            'manufacturer' => $i->manufacturer,
            'lot_number' => $i->lot_number,
            'administered_on' => $i->administered_on?->toDateString(),
            'dose_number' => $i->dose_number,
            'series_doses' => $i->series_doses,
            'site' => $i->site,
            'route' => $i->route,
            'administered_by' => $i->administered_by,
            'facility_name' => $i->facility_name,
            'notes' => $i->notes,
            'created_at' => $i->created_at?->toDateTimeString(),
            'updated_at' => $i->updated_at?->toDateTimeString(),
        ];
    }
}
