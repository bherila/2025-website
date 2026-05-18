<?php

namespace Tests\Feature\PHR;

use App\Models\PhrDocument;
use App\Models\PhrExport;
use App\Models\PhrLabResult;
use App\Models\PhrPatient;
use App\Models\PhrPatientUserAccess;
use App\Models\PhrPatientVital;
use App\Models\User;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;
use ZipArchive;

class PhrExportTest extends TestCase
{
    public function test_owner_can_generate_zip_export_with_standard_artifacts(): void
    {
        Storage::fake('phr_documents');
        Storage::fake('phr_exports');

        $owner = $this->createUser();
        $patient = $this->createPatient($owner);

        PhrLabResult::create([
            'patient_id' => $patient->id,
            'user_id' => $owner->id,
            'test_name' => 'CBC',
            'analyte' => 'Hemoglobin',
            'value' => '13.2',
            'unit' => 'g/dL',
            'result_datetime' => '2026-01-15 10:00:00',
        ]);

        PhrPatientVital::create([
            'patient_id' => $patient->id,
            'user_id' => $owner->id,
            'vital_name' => 'Blood Pressure',
            'vital_value' => '120/80',
            'unit' => 'mmHg',
            'observed_at' => '2026-01-15 10:05:00',
        ]);

        Storage::disk('phr_documents')->put('source/lab.pdf', '%PDF-1.4 test');
        $document = PhrDocument::create([
            'patient_id' => $patient->id,
            'user_id' => $owner->id,
            'uploaded_by_user_id' => $owner->id,
            'title' => 'Lab PDF',
            'document_type' => 'lab_report',
            'original_filename' => 'lab.pdf',
            'storage_disk' => 'phr_documents',
            'storage_path' => 'source/lab.pdf',
            'mime_type' => 'application/pdf',
            'byte_size' => strlen('%PDF-1.4 test'),
            'file_hash' => hash('sha256', '%PDF-1.4 test'),
        ]);

        $response = $this->actingAs($owner)->postJson("/api/phr/patients/{$patient->id}/exports", [
            'formats' => ['zip'],
        ]);

        $response
            ->assertAccepted()
            ->assertJsonPath('export.status', PhrExport::STATUS_READY)
            ->assertJsonPath('export.format', 'zip')
            ->assertJsonPath('export.formats.0', 'zip');

        $downloadUrl = $response->json('export.download_url');
        $this->assertIsString($downloadUrl);
        $this->assertNotSame('', $downloadUrl);

        $export = PhrExport::query()->where('patient_id', $patient->id)->sole();
        $this->assertSame(PhrExport::STATUS_READY, $export->status);
        $this->assertNotNull($export->storage_path);
        Storage::disk('phr_exports')->assertExists($export->storage_path);

        $zip = new ZipArchive;
        $this->assertTrue($zip->open(Storage::disk('phr_exports')->path($export->storage_path)));
        $this->assertNotFalse($zip->locateName('fhir.json'));
        $this->assertNotFalse($zip->locateName('ccda.xml'));
        $this->assertNotFalse($zip->locateName('summary.pdf'));
        $this->assertNotFalse($zip->locateName("documents/{$document->id}-lab.pdf"));
        $this->assertStringContainsString('Hemoglobin', (string) $zip->getFromName('fhir.json'));
        $zip->close();
    }

    public function test_manager_cannot_export_patient_record(): void
    {
        $owner = $this->createUser();
        $manager = $this->createUser();
        $patient = $this->createPatient($owner);

        PhrPatientUserAccess::create([
            'patient_id' => $patient->id,
            'user_id' => $manager->id,
            'access_level' => PhrPatientUserAccess::LEVEL_MANAGER,
            'granted_by_user_id' => $owner->id,
            'granted_at' => now(),
        ]);

        $this->actingAs($manager)->postJson("/api/phr/patients/{$patient->id}/exports", [
            'formats' => ['zip'],
        ])->assertForbidden();
    }

    private function createPatient(User $owner): PhrPatient
    {
        return PhrPatient::create([
            'owner_user_id' => $owner->id,
            'display_name' => 'Test Patient',
            'relationship' => 'self',
        ]);
    }
}
