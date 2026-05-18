<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Requests\PHR\StoreVitalRequest;
use App\Models\PhrPatientVital;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VitalController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        $vitals = PhrPatientVital::query()
            ->forPatient((int) $resolvedPatient->id)
            ->orderByDesc('observed_at')
            ->orderByDesc('vital_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (PhrPatientVital $vital): array => $this->vitalPayload($vital))
            ->values();

        return response()->json([
            'vitals' => $vitals,
            'can_manage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }

    public function store(StoreVitalRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService->writablePatient($patient, $userId);

        $vital = PhrPatientVital::create([
            'patient_id' => $resolvedPatient->id,
            'user_id' => $resolvedPatient->owner_user_id,
            ...$request->validated(),
        ]);

        return response()->json(['vital' => $this->vitalPayload($vital)], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function vitalPayload(PhrPatientVital $vital): array
    {
        return [
            'id' => $vital->id,
            'patient_id' => $vital->patient_id,
            'user_id' => $vital->user_id,
            'vital_name' => $vital->vital_name,
            'vital_date' => $vital->vital_date?->toDateString(),
            'observed_at' => $vital->observed_at?->toDateTimeString(),
            'vital_value' => $vital->vital_value,
            'value_numeric' => $vital->value_numeric,
            'value_numeric_secondary' => $vital->value_numeric_secondary,
            'unit' => $vital->unit,
            'secondary_unit' => $vital->secondary_unit,
            'body_site' => $vital->body_site,
            'source' => $vital->source,
            'notes' => $vital->notes,
            'created_at' => $vital->created_at?->toDateTimeString(),
            'updated_at' => $vital->updated_at?->toDateTimeString(),
        ];
    }
}
