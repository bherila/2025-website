<?php

namespace App\Http\Controllers\PHR\Concerns;

use App\Models\PhrPatient;
use App\Models\PhrPatientUserAccess;
use Illuminate\Database\Eloquent\Collection;

trait ResolvesPHRPatientAccess
{
    private function accessiblePatient(int $patientId, int $userId): PhrPatient
    {
        return PhrPatient::query()
            ->accessibleBy($userId)
            ->with(['accessGrants.user'])
            ->findOrFail($patientId);
    }

    private function canManagePatient(PhrPatient $patient, int $userId): bool
    {
        if ((int) $patient->owner_user_id === $userId) {
            return true;
        }

        return $patient->accessGrants
            ->contains(fn (PhrPatientUserAccess $access): bool => (int) $access->user_id === $userId && in_array($access->access_level, [
                PhrPatientUserAccess::LEVEL_OWNER,
                PhrPatientUserAccess::LEVEL_MANAGER,
            ], true));
    }

    private function ensurePatientManager(PhrPatient $patient, int $userId): void
    {
        abort_unless($this->canManagePatient($patient, $userId), 403);
    }

    private function ensurePatientOwner(PhrPatient $patient, int $userId): void
    {
        abort_unless((int) $patient->owner_user_id === $userId, 403);
    }

    /**
     * @return array<string, mixed>
     */
    private function patientPayload(PhrPatient $patient, int $userId): array
    {
        $canShare = (int) $patient->owner_user_id === $userId;
        $accessLevel = $canShare
            ? PhrPatientUserAccess::LEVEL_OWNER
            : $this->accessLevelForUser($patient->accessGrants, $userId);

        return [
            'id' => $patient->id,
            'owner_user_id' => $patient->owner_user_id,
            'display_name' => $patient->display_name,
            'relationship' => $patient->relationship,
            'birth_date' => $patient->birth_date?->toDateString(),
            'sex_at_birth' => $patient->sex_at_birth,
            'notes' => $patient->notes,
            'archived_at' => $patient->archived_at?->toDateTimeString(),
            'created_at' => $patient->created_at?->toDateTimeString(),
            'updated_at' => $patient->updated_at?->toDateTimeString(),
            'access_level' => $accessLevel,
            'can_manage' => $this->canManagePatient($patient, $userId),
            'can_share' => $canShare,
            'access_grants' => $canShare
                ? $patient->accessGrants
                    ->map(fn (PhrPatientUserAccess $access): array => [
                        'id' => $access->id,
                        'user_id' => $access->user_id,
                        'user_name' => $access->user?->name,
                        'user_email' => $access->user?->email,
                        'access_level' => $access->access_level,
                        'granted_at' => $access->granted_at?->toDateTimeString(),
                    ])
                    ->values()
                    ->all()
                : [],
        ];
    }

    /**
     * @param  Collection<int, PhrPatientUserAccess>  $accessGrants
     */
    private function accessLevelForUser(Collection $accessGrants, int $userId): ?string
    {
        $access = $accessGrants->first(fn (PhrPatientUserAccess $grant): bool => (int) $grant->user_id === $userId);

        return $access?->access_level;
    }
}
