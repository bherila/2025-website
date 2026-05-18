<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\ResolvesPHRPatientAccess;
use App\Http\Requests\PHR\StoreAllergyRequest;
use App\Models\PhrAllergy;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class AllergyController extends Controller
{
    use ResolvesPHRPatientAccess;

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);

        $allergies = PhrAllergy::query()
            ->where('patient_id', $resolvedPatient->id)
            ->orderBy('clinical_status')
            ->orderBy('substance')
            ->get()
            ->map(fn (PhrAllergy $a): array => $this->payload($a))
            ->values();

        return response()->json(['allergies' => $allergies]);
    }

    public function store(StoreAllergyRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $allergy = PhrAllergy::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['allergy' => $this->payload($allergy)], 201);
    }

    public function show(Request $request, int $patient, int $allergy): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);

        $resolved = PhrAllergy::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($allergy);

        return response()->json(['allergy' => $this->payload($resolved)]);
    }

    public function update(StoreAllergyRequest $request, int $patient, int $allergy): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        $resolved = PhrAllergy::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($allergy);
        $resolved->update($request->validated());

        return response()->json(['allergy' => $this->payload($resolved)]);
    }

    public function destroy(Request $request, int $patient, int $allergy): Response
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientManager($resolvedPatient, $userId);

        PhrAllergy::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($allergy)
            ->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(PhrAllergy $a): array
    {
        return [
            'id' => $a->id,
            'patient_id' => $a->patient_id,
            'user_id' => $a->user_id,
            'substance' => $a->substance,
            'rxnorm_code' => $a->rxnorm_code,
            'snomed_code' => $a->snomed_code,
            'category' => $a->category,
            'criticality' => $a->criticality,
            'clinical_status' => $a->clinical_status,
            'verification_status' => $a->verification_status,
            'reaction' => $a->reaction,
            'severity' => $a->severity,
            'notes' => $a->notes,
            'raw_text' => $a->raw_text,
            'created_at' => $a->created_at?->toDateTimeString(),
            'updated_at' => $a->updated_at?->toDateTimeString(),
        ];
    }
}
