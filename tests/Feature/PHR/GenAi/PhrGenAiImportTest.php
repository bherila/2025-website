<?php

namespace Tests\Feature\PHR\GenAi;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\GenAiProcessor\Models\GenAiImportResult;
use App\Models\PhrLabResult;
use App\Models\PhrPatient;
use App\Models\PhrPatientUserAccess;
use App\Models\User;
use Tests\TestCase;

class PhrGenAiImportTest extends TestCase
{
    public function test_accepting_phr_genai_lab_result_creates_patient_row(): void
    {
        $owner = $this->createUser();
        $patient = $this->createPatient($owner);
        $job = $this->createJob($owner, $patient, 'phr_lab_result');
        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'status' => 'pending_review',
            'result_json' => json_encode([
                'external_id' => 'genai-lab-1',
                'test_name' => 'CMP',
                'analyte' => 'Creatinine',
                'value' => '0.9',
                'unit' => 'mg/dL',
            ], JSON_THROW_ON_ERROR),
        ]);

        $this->actingAs($owner)
            ->postJson("/api/phr/genai/jobs/{$job->id}/results/{$result->id}/accept")
            ->assertOk()
            ->assertJsonPath('import.created', 1);

        $this->assertSame(1, PhrLabResult::query()->where('patient_id', $patient->id)->count());
        $this->assertSame('Creatinine', PhrLabResult::query()->where('patient_id', $patient->id)->sole()->analyte);
        $this->assertSame('imported', $result->refresh()->status);
        $this->assertSame('imported', $job->refresh()->status);
    }

    public function test_viewer_cannot_accept_phr_genai_result(): void
    {
        $owner = $this->createUser();
        $viewer = $this->createUser();
        $patient = $this->createPatient($owner);
        PhrPatientUserAccess::create([
            'patient_id' => $patient->id,
            'user_id' => $viewer->id,
            'access_level' => PhrPatientUserAccess::LEVEL_VIEWER,
            'granted_by_user_id' => $owner->id,
            'granted_at' => now(),
        ]);

        $job = $this->createJob($viewer, $patient, 'phr_lab_result');
        $result = GenAiImportResult::create([
            'job_id' => $job->id,
            'result_index' => 0,
            'status' => 'pending_review',
            'result_json' => json_encode(['analyte' => 'Creatinine'], JSON_THROW_ON_ERROR),
        ]);

        $this->actingAs($viewer)
            ->postJson("/api/phr/genai/jobs/{$job->id}/results/{$result->id}/accept")
            ->assertForbidden();

        $this->assertSame(0, PhrLabResult::query()->where('patient_id', $patient->id)->count());
        $this->assertSame('pending_review', $result->refresh()->status);
    }

    private function createPatient(User $owner): PhrPatient
    {
        return PhrPatient::create([
            'owner_user_id' => $owner->id,
            'display_name' => 'Test Patient',
            'relationship' => 'self',
        ]);
    }

    private function createJob(User $user, PhrPatient $patient, string $jobType): GenAiImportJob
    {
        return GenAiImportJob::create([
            'user_id' => $user->id,
            'job_type' => $jobType,
            'file_hash' => hash('sha256', $jobType.$patient->id.$user->id),
            'original_filename' => 'source.pdf',
            's3_path' => 'genai-import/source.pdf',
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 100,
            'context_json' => json_encode(['patient_id' => $patient->id], JSON_THROW_ON_ERROR),
            'status' => 'parsed',
        ]);
    }
}
