<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\ResolvesPHRPatientAccess;
use App\Http\Requests\PHR\StorePatientAccessRequest;
use App\Models\PhrPatientUserAccess;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PatientAccessController extends Controller
{
    use ResolvesPHRPatientAccess;

    public function store(StorePatientAccessRequest $request, int $patient): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientOwner($resolvedPatient, $userId);

        $validated = $request->validated();
        $targetUser = User::query()->where('email', $validated['email'])->firstOrFail();

        abort_if((int) $targetUser->id === $userId, 422, 'The owner already has access.');

        $access = PhrPatientUserAccess::updateOrCreate(
            [
                'patient_id' => $resolvedPatient->id,
                'user_id' => $targetUser->id,
            ],
            [
                'access_level' => $validated['access_level'],
                'granted_by_user_id' => $userId,
                'granted_at' => now(),
            ],
        );

        $resolvedPatient->load(['accessGrants.user']);

        return response()->json([
            'access' => [
                'id' => $access->id,
                'user_id' => $targetUser->id,
                'user_name' => $targetUser->name,
                'user_email' => $targetUser->email,
                'access_level' => $access->access_level,
                'granted_at' => $access->granted_at?->toDateTimeString(),
            ],
            'patient' => $this->patientPayload($resolvedPatient, $userId),
        ], 201);
    }

    public function destroy(Request $request, int $patient, int $access): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $this->ensurePatientOwner($resolvedPatient, $userId);

        PhrPatientUserAccess::query()
            ->where('patient_id', $resolvedPatient->id)
            ->where('access_level', '!=', PhrPatientUserAccess::LEVEL_OWNER)
            ->findOrFail($access)
            ->delete();

        return response()->json(['ok' => true]);
    }
}
