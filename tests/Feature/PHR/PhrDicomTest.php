<?php

namespace Tests\Feature\PHR;

use App\Models\PhrDicomFile;
use App\Models\PhrDicomInstance;
use App\Models\PhrDicomSeries;
use App\Models\PhrDicomStudy;
use App\Models\PhrDicomUpload;
use App\Models\User;
use App\Services\PHR\DICOM\DicomUploadProcessor;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PhrDicomTest extends TestCase
{
    public function test_phr_dicom_schema_exists(): void
    {
        $this->assertTrue(Schema::hasTable('phr_dicom_uploads'));
        $this->assertTrue(Schema::hasTable('phr_dicom_files'));
        $this->assertTrue(Schema::hasTable('phr_dicom_studies'));
        $this->assertTrue(Schema::hasTable('phr_dicom_series'));
        $this->assertTrue(Schema::hasTable('phr_dicom_instances'));
        $this->assertTrue(Schema::hasColumn('phr_dicom_files', 'original_relative_path'));
        $this->assertTrue(Schema::hasColumn('phr_dicom_instances', 'transfer_syntax_uid'));
        $this->assertTrue(Schema::hasIndex('phr_dicom_studies', 'phr_dicom_studies_patient_uid_unique'));
    }

    public function test_manager_can_upload_directory_and_viewer_can_read_metadata_and_download_study(): void
    {
        $this->fakeDicomDisk();

        $owner = $this->createUser();
        $manager = $this->createUser();
        $viewer = $this->createUser();
        $other = $this->createUser();

        $patientId = $this->createPatientFor($owner);
        $this->grantPatientAccess($owner, $patientId, $manager, 'manager');
        $this->grantPatientAccess($owner, $patientId, $viewer, 'viewer');

        $uploadResponse = $this->actingAs($manager)->post("/api/phr/patients/{$patientId}/dicom/uploads", [
            'files' => [
                UploadedFile::fake()->createWithContent('DICOMDIR', $this->dicomdirBytes()),
                UploadedFile::fake()->createWithContent('IM0001', $this->dicomBytes()),
                UploadedFile::fake()->createWithContent('SETUP.EXE', 'not a dicom file'),
            ],
            'relative_paths' => [
                'CARDIAC_CT/DICOMDIR',
                'CARDIAC_CT/ST0001/SE0001/IM0001',
                'CARDIAC_CT/VIEWER/SETUP.EXE',
            ],
        ]);

        $uploadResponse
            ->assertCreated()
            ->assertJsonPath('upload.total_files', 3)
            ->assertJsonPath('upload.stored_files', 2)
            ->assertJsonPath('upload.skipped_files', 1)
            ->assertJsonPath('upload.status', PhrDicomUpload::STATUS_PROCESSED)
            ->assertJsonPath('upload.original_root_name', 'CARDIAC_CT');

        $study = PhrDicomStudy::query()->where('patient_id', $patientId)->sole();
        $series = PhrDicomSeries::query()->where('study_id', $study->id)->sole();
        $instance = PhrDicomInstance::query()->where('series_id', $series->id)->sole();
        $upload = PhrDicomUpload::query()->where('patient_id', $patientId)->sole();

        $this->assertSame('1.2.840.113619.2.55.3.604688437.20260517.1', $study->study_instance_uid);
        $this->assertSame('CT', $study->modalities);
        $this->assertSame('CARDIAC_CT/ST0001/SE0001/IM0001', $instance->file->original_relative_path);
        $this->assertSame(1, $upload->skipped_files);
        $this->assertSame(2, PhrDicomFile::query()->where('patient_id', $patientId)->count());
        Storage::disk(DicomUploadProcessor::DISK)->assertExists($instance->file->r2_key);

        $this->actingAs($viewer)->getJson("/api/phr/patients/{$patientId}/dicom/studies")
            ->assertOk()
            ->assertJsonPath('studies.0.instance_count', 1);

        $this->actingAs($viewer)->getJson("/api/phr/patients/{$patientId}/dicom/studies/{$study->id}/viewer-json")
            ->assertOk()
            ->assertJsonPath('studies.0.StudyInstanceUID', $study->study_instance_uid)
            ->assertJsonPath('studies.0.series.0.instances.0.metadata.Rows', 512)
            ->assertJsonPath('studies.0.series.0.instances.0.url', url("/api/phr/patients/{$patientId}/dicom/instances/{$instance->id}/file"));

        $this->actingAs($viewer)->get("/api/phr/patients/{$patientId}/dicom/instances/{$instance->id}/file")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/dicom');

        $this->actingAs($viewer)->get("/api/phr/patients/{$patientId}/dicom/studies/{$study->id}/download")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/zip');

        $this->actingAs($viewer)->post("/api/phr/patients/{$patientId}/dicom/uploads", [
            'files' => [
                UploadedFile::fake()->createWithContent('IM0002', $this->dicomBytes([
                    'sop_instance_uid' => '1.2.840.113619.2.55.3.604688437.20260517.2.2',
                ])),
            ],
            'relative_paths' => ['CARDIAC_CT/ST0001/SE0001/IM0002'],
        ])->assertForbidden();

        $this->actingAs($other)->getJson("/api/phr/patients/{$patientId}/dicom/studies")->assertNotFound();
        $this->actingAs($other)->get("/api/phr/patients/{$patientId}/dicom/instances/{$instance->id}/file")->assertNotFound();
    }

    public function test_relative_paths_with_traversal_segments_are_sanitized(): void
    {
        $this->fakeDicomDisk();

        $owner = $this->createUser();
        $manager = $this->createUser();
        $patientId = $this->createPatientFor($owner);
        $this->grantPatientAccess($owner, $patientId, $manager, 'manager');

        $this->actingAs($manager)->post("/api/phr/patients/{$patientId}/dicom/uploads", [
            'files' => [
                UploadedFile::fake()->createWithContent('IM0001', $this->dicomBytes()),
            ],
            // Both '..' segments and absolute-style leading slashes must be stripped.
            'relative_paths' => ['../../../etc/passwd/IM0001'],
        ])->assertCreated()->assertJsonPath('upload.stored_files', 1);

        $file = PhrDicomFile::query()->where('patient_id', $patientId)->sole();

        // Sanitizer must have stripped all '..' segments — the stored path
        // stays inside the upload's prefix and the relative path no longer
        // contains traversal markers.
        $this->assertStringNotContainsString('..', $file->original_relative_path);
        $this->assertStringNotContainsString('..', $file->r2_key);
        $this->assertStringStartsWith('phr/dicom/patients/', $file->r2_key);
        $this->assertSame('etc/passwd/IM0001', $file->original_relative_path);
    }

    public function test_reupload_of_same_study_preserves_original_upload_id(): void
    {
        $this->fakeDicomDisk();

        $owner = $this->createUser();
        $manager = $this->createUser();
        $patientId = $this->createPatientFor($owner);
        $this->grantPatientAccess($owner, $patientId, $manager, 'manager');

        $this->actingAs($manager)->post("/api/phr/patients/{$patientId}/dicom/uploads", [
            'files' => [UploadedFile::fake()->createWithContent('IM0001', $this->dicomBytes())],
            'relative_paths' => ['CARDIAC_CT/ST0001/SE0001/IM0001'],
        ])->assertCreated();

        $study = PhrDicomStudy::query()->where('patient_id', $patientId)->sole();
        $originalUploadId = (int) $study->upload_id;
        $this->assertNotSame(0, $originalUploadId);

        // Re-upload a second instance for the same study/series. The study
        // should pick up the new instance but its upload_id must NOT change.
        $this->actingAs($manager)->post("/api/phr/patients/{$patientId}/dicom/uploads", [
            'files' => [UploadedFile::fake()->createWithContent('IM0002', $this->dicomBytes([
                'sop_instance_uid' => '1.2.840.113619.2.55.3.604688437.20260517.1.1.2',
            ]))],
            'relative_paths' => ['CARDIAC_CT/ST0001/SE0001/IM0002'],
        ])->assertCreated();

        $this->assertSame(2, PhrDicomUpload::query()->where('patient_id', $patientId)->count());
        $study->refresh();
        $this->assertSame($originalUploadId, (int) $study->upload_id);
        $this->assertSame(2, PhrDicomInstance::query()->where('study_id', $study->id)->count());
    }

    private function fakeDicomDisk(): void
    {
        Storage::fake(DicomUploadProcessor::DISK);
    }

    private function createPatientFor(User $owner): int
    {
        $response = $this->actingAs($owner)->postJson('/api/phr/patients', [
            'display_name' => 'Primary',
            'relationship' => 'self',
        ])->assertCreated();

        return (int) $response->json('patient.id');
    }

    private function grantPatientAccess(User $owner, int $patientId, User $grantee, string $level): void
    {
        $this->actingAs($owner)->postJson("/api/phr/patients/{$patientId}/access", [
            'email' => $grantee->email,
            'access_level' => $level,
        ])->assertCreated();
    }

    /**
     * @param  array<string, string>  $overrides
     */
    private function dicomBytes(array $overrides = []): string
    {
        $values = [
            'study_instance_uid' => '1.2.840.113619.2.55.3.604688437.20260517.1',
            'series_instance_uid' => '1.2.840.113619.2.55.3.604688437.20260517.1.1',
            'sop_instance_uid' => '1.2.840.113619.2.55.3.604688437.20260517.1.1.1',
            ...$overrides,
        ];

        return str_repeat("\0", 128).'DICM'
            .$this->element(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1')
            .$this->element(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2')
            .$this->element(0x0008, 0x0018, 'UI', $values['sop_instance_uid'])
            .$this->element(0x0008, 0x0020, 'DA', '20260517')
            .$this->element(0x0008, 0x0030, 'TM', '101112')
            .$this->element(0x0008, 0x0050, 'SH', 'ACC-1')
            .$this->element(0x0008, 0x0060, 'CS', 'CT')
            .$this->element(0x0008, 0x1030, 'LO', 'Cardiac CT')
            .$this->element(0x0008, 0x103E, 'LO', 'Axial')
            .$this->element(0x0010, 0x0010, 'PN', 'Primary^Patient')
            .$this->element(0x0010, 0x0020, 'LO', 'PHR-1')
            .$this->element(0x0010, 0x0040, 'CS', 'O')
            .$this->element(0x0018, 0x0050, 'DS', '2.5')
            .$this->element(0x0020, 0x000D, 'UI', $values['study_instance_uid'])
            .$this->element(0x0020, 0x000E, 'UI', $values['series_instance_uid'])
            .$this->element(0x0020, 0x0011, 'IS', '1')
            .$this->element(0x0020, 0x0013, 'IS', '1')
            .$this->element(0x0020, 0x0032, 'DS', '0\\0\\0')
            .$this->element(0x0020, 0x0037, 'DS', '1\\0\\0\\0\\1\\0')
            .$this->element(0x0020, 0x0052, 'UI', '1.2.3.4.5')
            .$this->element(0x0028, 0x0002, 'US', pack('v', 1))
            .$this->element(0x0028, 0x0004, 'CS', 'MONOCHROME2')
            .$this->element(0x0028, 0x0010, 'US', pack('v', 512))
            .$this->element(0x0028, 0x0011, 'US', pack('v', 512))
            .$this->element(0x0028, 0x0030, 'DS', '0.7\\0.7')
            .$this->element(0x0028, 0x0100, 'US', pack('v', 16))
            .$this->element(0x0028, 0x0101, 'US', pack('v', 12))
            .$this->element(0x0028, 0x0102, 'US', pack('v', 11))
            .$this->element(0x0028, 0x0103, 'US', pack('v', 0));
    }

    private function dicomdirBytes(): string
    {
        return str_repeat("\0", 128).'DICM'.$this->element(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');
    }

    private function element(int $group, int $element, string $vr, string $value): string
    {
        $padding = $vr === 'UI' ? "\0" : ' ';
        if (strlen($value) % 2 === 1) {
            $value .= $padding;
        }

        return pack('v', $group).pack('v', $element).$vr.pack('v', strlen($value)).$value;
    }
}
