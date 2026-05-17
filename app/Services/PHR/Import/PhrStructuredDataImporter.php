<?php

namespace App\Services\PHR\Import;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\PhrAllergy;
use App\Models\PhrCondition;
use App\Models\PhrDocument;
use App\Models\PhrImmunization;
use App\Models\PhrLabResult;
use App\Models\PhrMedication;
use App\Models\PhrOfficeVisit;
use App\Models\PhrPatient;
use App\Models\PhrPatientVital;
use App\Models\PhrProcedure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;

class PhrStructuredDataImporter
{
    public const array JOB_TYPES = [
        'phr_lab_result',
        'phr_vital',
        'phr_office_visit',
        'phr_medication',
        'phr_immunization',
        'phr_problem_list',
        'phr_procedure',
        'phr_allergy',
        'phr_document',
    ];

    public static function isPhrJobType(string $jobType): bool
    {
        return in_array($jobType, self::JOB_TYPES, true);
    }

    /**
     * @return array<int, string>
     */
    public static function writableJobTypes(): array
    {
        return self::JOB_TYPES;
    }

    /**
     * @param  array<array-key, mixed>  $payload
     * @param  array{import_source?: string, source?: string, external_id?: string|null, genai_job_id?: int|null}  $options
     */
    public function importPayload(PhrPatient $patient, int $actorUserId, string $jobType, array $payload, array $options = []): PhrImportResult
    {
        if (! self::isPhrJobType($jobType)) {
            throw new InvalidArgumentException("Unsupported PHR job type: {$jobType}");
        }

        return DB::transaction(function () use ($patient, $actorUserId, $jobType, $payload, $options): PhrImportResult {
            if ($jobType === 'phr_document') {
                $document = $this->createOrUpdateDocument($patient, $actorUserId, $payload, $options);

                return new PhrImportResult(documents: 1, created: $document->wasRecentlyCreated ? 1 : 0, updated: $document->wasRecentlyCreated ? 0 : 1);
            }

            $result = new PhrImportResult;
            foreach ($this->recordsFromPayload($jobType, $payload) as $record) {
                if (! is_array($record)) {
                    $result->addSkipped();

                    continue;
                }

                $attributes = $this->attributesFor($patient, $actorUserId, $jobType, $record, $options);
                if ($attributes === [] || $this->missingRequiredField($jobType, $attributes)) {
                    $result->addSkipped();

                    continue;
                }

                $model = $this->upsertModel($this->modelClassFor($jobType), $attributes);
                $model->wasRecentlyCreated ? $result->addCreated() : $result->addUpdated();
            }

            return $result;
        });
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function storeLocalDocument(PhrPatient $patient, int $actorUserId, string $path, array $attributes = []): PhrDocument
    {
        if (! is_file($path) || ! is_readable($path)) {
            throw new RuntimeException("Document path is not readable: {$path}");
        }

        $filename = (string) ($attributes['original_filename'] ?? basename($path));
        $storagePath = $this->documentStoragePath((int) $patient->id, $filename);
        $contents = file_get_contents($path);
        if ($contents === false) {
            throw new RuntimeException("Unable to read document path: {$path}");
        }

        Storage::disk('phr_documents')->put($storagePath, $contents);

        return PhrDocument::create([
            'patient_id' => $patient->id,
            'user_id' => $patient->owner_user_id,
            'uploaded_by_user_id' => $actorUserId,
            'title' => $attributes['title'] ?? pathinfo($filename, PATHINFO_FILENAME),
            'document_type' => $attributes['document_type'] ?? 'general',
            'original_filename' => $filename,
            'storage_disk' => 'phr_documents',
            'storage_path' => $storagePath,
            'mime_type' => $attributes['mime_type'] ?? $this->mimeType($path),
            'file_size_bytes' => filesize($path) ?: strlen($contents),
            'sha256' => hash('sha256', $contents),
            'extracted_text' => $attributes['extracted_text'] ?? null,
            'summary' => $attributes['summary'] ?? null,
            'source' => $attributes['source'] ?? 'cli',
            'import_source' => $attributes['import_source'] ?? null,
            'external_id' => $attributes['external_id'] ?? null,
            'imported_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function storeGenAiDocument(PhrPatient $patient, int $actorUserId, GenAiImportJob $job, array $payload): PhrDocument
    {
        $filename = $job->original_filename ?: 'phr-document-'.$job->id;
        $storagePath = $this->documentStoragePath((int) $patient->id, $filename);
        $stream = Storage::disk('s3')->readStream($job->s3_path);
        if ($stream === null) {
            throw new RuntimeException('Unable to read GenAI source file.');
        }

        try {
            Storage::disk('phr_documents')->put($storagePath, $stream);
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
        }

        return PhrDocument::create([
            'patient_id' => $patient->id,
            'user_id' => $patient->owner_user_id,
            'uploaded_by_user_id' => $actorUserId,
            'genai_job_id' => $job->id,
            'title' => $this->string($payload['title'] ?? null) ?? pathinfo($filename, PATHINFO_FILENAME),
            'document_type' => $this->string($payload['document_type'] ?? null) ?? 'general',
            'original_filename' => $filename,
            'storage_disk' => 'phr_documents',
            'storage_path' => $storagePath,
            'mime_type' => $job->mime_type,
            'file_size_bytes' => $job->file_size_bytes,
            'sha256' => $job->file_hash,
            'extracted_text' => $this->string($payload['extracted_text'] ?? $payload['text'] ?? null),
            'summary' => $this->string($payload['summary'] ?? null),
            'source' => 'genai',
            'import_source' => 'genai',
            'external_id' => 'genai-job-'.$job->id,
            'imported_at' => now(),
        ]);
    }

    /**
     * @param  array<string, mixed>  $payload
     * @param  array{import_source?: string, source?: string, external_id?: string|null, genai_job_id?: int|null}  $options
     */
    private function createOrUpdateDocument(PhrPatient $patient, int $actorUserId, array $payload, array $options): PhrDocument
    {
        $attributes = [
            'patient_id' => $patient->id,
            'user_id' => $patient->owner_user_id,
            'uploaded_by_user_id' => $actorUserId,
            'genai_job_id' => $options['genai_job_id'] ?? null,
            'title' => $this->string($payload['title'] ?? null),
            'document_type' => $this->string($payload['document_type'] ?? null) ?? 'general',
            'original_filename' => $this->string($payload['original_filename'] ?? null),
            'storage_disk' => $this->string($payload['storage_disk'] ?? null) ?? 'phr_documents',
            'storage_path' => $this->string($payload['storage_path'] ?? null),
            'mime_type' => $this->string($payload['mime_type'] ?? null),
            'file_size_bytes' => (int) ($payload['file_size_bytes'] ?? 0),
            'sha256' => $this->string($payload['sha256'] ?? null),
            'extracted_text' => $this->string($payload['extracted_text'] ?? $payload['text'] ?? null),
            'summary' => $this->string($payload['summary'] ?? null),
            'source' => $this->string($payload['source'] ?? null) ?? ($options['source'] ?? null),
            'import_source' => $options['import_source'] ?? $this->string($payload['import_source'] ?? null),
            'external_id' => $this->externalId($payload, $options),
            'imported_at' => now(),
        ];

        $document = $this->upsertModel(PhrDocument::class, $attributes);
        if (! $document instanceof PhrDocument) {
            throw new RuntimeException('Unable to create PHR document.');
        }

        return $document;
    }

    /**
     * @param  array<array-key, mixed>  $payload
     * @return array<int, mixed>
     */
    private function recordsFromPayload(string $jobType, array $payload): array
    {
        if (array_is_list($payload)) {
            return $payload;
        }

        $keys = match ($jobType) {
            'phr_lab_result' => ['lab_results', 'labs', 'results', 'records'],
            'phr_vital' => ['vitals', 'vital_signs', 'records'],
            'phr_office_visit' => ['office_visits', 'visits', 'encounters', 'records'],
            'phr_medication' => ['medications', 'medication_list', 'records'],
            'phr_immunization' => ['immunizations', 'vaccines', 'records'],
            'phr_problem_list' => ['conditions', 'problems', 'problem_list', 'records'],
            'phr_procedure' => ['procedures', 'records'],
            'phr_allergy' => ['allergies', 'allergy_intolerances', 'records'],
            default => ['records'],
        };

        foreach ($keys as $key) {
            if (isset($payload[$key]) && is_array($payload[$key])) {
                return array_is_list($payload[$key]) ? $payload[$key] : [$payload[$key]];
            }
        }

        return [$payload];
    }

    /**
     * @param  array<string, mixed>  $record
     * @param  array{import_source?: string, source?: string, external_id?: string|null, genai_job_id?: int|null}  $options
     * @return array<string, mixed>
     */
    private function attributesFor(PhrPatient $patient, int $actorUserId, string $jobType, array $record, array $options): array
    {
        $base = [
            'patient_id' => $patient->id,
            'user_id' => $patient->owner_user_id,
            'import_source' => $options['import_source'] ?? $this->string($record['import_source'] ?? null),
            'external_id' => $this->externalId($record, $options),
        ];

        return match ($jobType) {
            'phr_lab_result' => [
                ...$base,
                'test_name' => $this->string($record['test_name'] ?? $record['panel'] ?? null),
                'collection_datetime' => $this->dateTime($record['collection_datetime'] ?? $record['collected_at'] ?? $record['observed_at'] ?? null),
                'result_datetime' => $this->dateTime($record['result_datetime'] ?? $record['resulted_at'] ?? $record['observed_at'] ?? null),
                'result_status' => $this->string($record['result_status'] ?? $record['status'] ?? null),
                'ordering_provider' => $this->string($record['ordering_provider'] ?? null),
                'resulting_lab' => $this->string($record['resulting_lab'] ?? $record['lab'] ?? null),
                'analyte' => $this->requiredString($record['analyte'] ?? $record['name'] ?? $record['test_name'] ?? null),
                'value' => $this->string($record['value'] ?? $record['raw_value'] ?? $record['result'] ?? null),
                'value_numeric' => $this->numeric($record['value_numeric'] ?? $record['numeric_value'] ?? $record['value'] ?? null),
                'unit' => $this->string($record['unit'] ?? null),
                'range_min' => $this->numeric($record['range_min'] ?? $record['reference_range_low'] ?? null),
                'range_max' => $this->numeric($record['range_max'] ?? $record['reference_range_high'] ?? null),
                'range_unit' => $this->string($record['range_unit'] ?? $record['unit'] ?? null),
                'reference_range_text' => $this->string($record['reference_range_text'] ?? $record['reference_range'] ?? null),
                'normal_value' => $this->string($record['normal_value'] ?? null),
                'abnormal_flag' => $this->string($record['abnormal_flag'] ?? $record['flag'] ?? null),
                'source' => $this->string($record['source'] ?? null) ?? ($options['source'] ?? null),
                'notes' => $this->string($record['notes'] ?? null),
            ],
            'phr_vital' => [
                ...$base,
                'vital_name' => $this->requiredString($record['vital_name'] ?? $record['name'] ?? null),
                'vital_date' => $this->date($record['vital_date'] ?? $record['date'] ?? $record['observed_at'] ?? null),
                'observed_at' => $this->dateTime($record['observed_at'] ?? $record['date_time'] ?? null),
                'vital_value' => $this->string($record['vital_value'] ?? $record['value'] ?? $record['raw_value'] ?? null),
                'value_numeric' => $this->numeric($record['value_numeric'] ?? $record['value'] ?? null),
                'value_numeric_secondary' => $this->numeric($record['value_numeric_secondary'] ?? $record['secondary_value'] ?? null),
                'unit' => $this->string($record['unit'] ?? null),
                'secondary_unit' => $this->string($record['secondary_unit'] ?? null),
                'body_site' => $this->string($record['body_site'] ?? null),
                'source' => $this->string($record['source'] ?? null) ?? ($options['source'] ?? null),
                'notes' => $this->string($record['notes'] ?? null),
            ],
            'phr_office_visit' => [
                ...$base,
                'visit_date' => $this->date($record['visit_date'] ?? $record['date'] ?? $record['visit_started_at'] ?? null),
                'visit_started_at' => $this->dateTime($record['visit_started_at'] ?? $record['started_at'] ?? null),
                'visit_ended_at' => $this->dateTime($record['visit_ended_at'] ?? $record['ended_at'] ?? null),
                'visit_type' => $this->string($record['visit_type'] ?? $record['type'] ?? null),
                'provider_name' => $this->string($record['provider_name'] ?? $record['provider'] ?? null),
                'provider_specialty' => $this->string($record['provider_specialty'] ?? null),
                'facility_name' => $this->string($record['facility_name'] ?? $record['facility'] ?? null),
                'chief_complaint' => $this->string($record['chief_complaint'] ?? $record['reason'] ?? null),
                'assessment' => $this->string($record['assessment'] ?? null),
                'plan' => $this->string($record['plan'] ?? null),
                'subjective' => $this->string($record['subjective'] ?? null),
                'objective' => $this->string($record['objective'] ?? null),
                'icd10_codes' => $this->codes($record['icd10_codes'] ?? $record['diagnoses'] ?? null),
                'cpt_codes' => $this->codes($record['cpt_codes'] ?? null),
                'raw_text' => $this->string($record['raw_text'] ?? null),
            ],
            'phr_medication' => [
                ...$base,
                'name' => $this->requiredString($record['name'] ?? $record['medication'] ?? null),
                'rxnorm_code' => $this->string($record['rxnorm_code'] ?? null),
                'dose' => $this->string($record['dose'] ?? null),
                'dose_unit' => $this->string($record['dose_unit'] ?? null),
                'route' => $this->string($record['route'] ?? null),
                'frequency' => $this->string($record['frequency'] ?? null),
                'started_on' => $this->date($record['started_on'] ?? $record['start_date'] ?? null),
                'ended_on' => $this->date($record['ended_on'] ?? $record['end_date'] ?? null),
                'status' => $this->string($record['status'] ?? null) ?? 'active',
                'prescriber_name' => $this->string($record['prescriber_name'] ?? $record['prescriber'] ?? null),
                'reason_for_use' => $this->string($record['reason_for_use'] ?? null),
                'raw_text' => $this->string($record['raw_text'] ?? null),
            ],
            'phr_immunization' => [
                ...$base,
                'vaccine_name' => $this->requiredString($record['vaccine_name'] ?? $record['name'] ?? $record['vaccine'] ?? null),
                'cvx_code' => $this->string($record['cvx_code'] ?? null),
                'manufacturer' => $this->string($record['manufacturer'] ?? null),
                'lot_number' => $this->string($record['lot_number'] ?? null),
                'administered_on' => $this->date($record['administered_on'] ?? $record['date'] ?? null),
                'dose_number' => $this->integer($record['dose_number'] ?? null),
                'series_doses' => $this->integer($record['series_doses'] ?? null),
                'site' => $this->string($record['site'] ?? null),
                'route' => $this->string($record['route'] ?? null),
                'administered_by' => $this->string($record['administered_by'] ?? null),
                'facility_name' => $this->string($record['facility_name'] ?? null),
                'notes' => $this->string($record['notes'] ?? null),
                'raw_text' => $this->string($record['raw_text'] ?? null),
            ],
            'phr_problem_list' => [
                ...$base,
                'name' => $this->requiredString($record['name'] ?? $record['condition'] ?? $record['problem'] ?? null),
                'icd10_code' => $this->string($record['icd10_code'] ?? null),
                'snomed_code' => $this->string($record['snomed_code'] ?? null),
                'onset_date' => $this->date($record['onset_date'] ?? null),
                'abated_date' => $this->date($record['abated_date'] ?? $record['resolved_date'] ?? null),
                'clinical_status' => $this->string($record['clinical_status'] ?? $record['status'] ?? null) ?? 'active',
                'verification_status' => $this->string($record['verification_status'] ?? null) ?? 'confirmed',
                'severity' => $this->string($record['severity'] ?? null),
                'notes' => $this->string($record['notes'] ?? null),
                'raw_text' => $this->string($record['raw_text'] ?? null),
            ],
            'phr_procedure' => [
                ...$base,
                'name' => $this->requiredString($record['name'] ?? $record['procedure'] ?? null),
                'cpt_code' => $this->string($record['cpt_code'] ?? null),
                'snomed_code' => $this->string($record['snomed_code'] ?? null),
                'performed_at' => $this->dateTime($record['performed_at'] ?? null),
                'performed_on' => $this->date($record['performed_on'] ?? $record['date'] ?? $record['performed_at'] ?? null),
                'performer_name' => $this->string($record['performer_name'] ?? null),
                'performer_specialty' => $this->string($record['performer_specialty'] ?? null),
                'facility_name' => $this->string($record['facility_name'] ?? null),
                'status' => $this->string($record['status'] ?? null) ?? 'completed',
                'reason' => $this->string($record['reason'] ?? null),
                'outcome' => $this->string($record['outcome'] ?? null),
                'notes' => $this->string($record['notes'] ?? null),
                'raw_text' => $this->string($record['raw_text'] ?? null),
            ],
            'phr_allergy' => [
                ...$base,
                'substance' => $this->requiredString($record['substance'] ?? $record['allergen'] ?? $record['name'] ?? null),
                'rxnorm_code' => $this->string($record['rxnorm_code'] ?? null),
                'snomed_code' => $this->string($record['snomed_code'] ?? null),
                'category' => $this->string($record['category'] ?? null),
                'criticality' => $this->string($record['criticality'] ?? null),
                'clinical_status' => $this->string($record['clinical_status'] ?? null) ?? 'active',
                'verification_status' => $this->string($record['verification_status'] ?? null) ?? 'confirmed',
                'reaction' => $this->string($record['reaction'] ?? null),
                'severity' => $this->string($record['severity'] ?? null),
                'notes' => $this->string($record['notes'] ?? null),
                'raw_text' => $this->string($record['raw_text'] ?? null),
            ],
            default => [],
        };
    }

    /**
     * @param  class-string<Model>  $modelClass
     * @param  array<string, mixed>  $attributes
     */
    private function upsertModel(string $modelClass, array $attributes): Model
    {
        $queryAttributes = null;
        if (! empty($attributes['import_source']) && ! empty($attributes['external_id'])) {
            $queryAttributes = [
                'patient_id' => $attributes['patient_id'],
                'import_source' => $attributes['import_source'],
                'external_id' => $attributes['external_id'],
            ];
        }

        if ($queryAttributes === null) {
            /** @var Model $created */
            $created = $modelClass::query()->create($attributes);

            return $created;
        }

        /** @var Model|null $existing */
        $existing = $modelClass::query()->where($queryAttributes)->first();
        if ($existing !== null) {
            $existing->update($attributes);
            $existing->wasRecentlyCreated = false;

            return $existing;
        }

        /** @var Model $created */
        $created = $modelClass::query()->create($attributes);

        return $created;
    }

    /**
     * @return class-string<Model>
     */
    private function modelClassFor(string $jobType): string
    {
        return match ($jobType) {
            'phr_lab_result' => PhrLabResult::class,
            'phr_vital' => PhrPatientVital::class,
            'phr_office_visit' => PhrOfficeVisit::class,
            'phr_medication' => PhrMedication::class,
            'phr_immunization' => PhrImmunization::class,
            'phr_problem_list' => PhrCondition::class,
            'phr_procedure' => PhrProcedure::class,
            'phr_allergy' => PhrAllergy::class,
            'phr_document' => PhrDocument::class,
            default => throw new InvalidArgumentException("Unsupported PHR job type: {$jobType}"),
        };
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function missingRequiredField(string $jobType, array $attributes): bool
    {
        $requiredField = match ($jobType) {
            'phr_lab_result' => 'analyte',
            'phr_vital' => 'vital_name',
            'phr_medication', 'phr_problem_list', 'phr_procedure' => 'name',
            'phr_immunization' => 'vaccine_name',
            'phr_allergy' => 'substance',
            default => null,
        };

        return $requiredField !== null && empty($attributes[$requiredField]);
    }

    /**
     * @param  array<string, mixed>  $record
     * @param  array{external_id?: string|null}  $options
     */
    private function externalId(array $record, array $options): ?string
    {
        return $this->string($options['external_id'] ?? null)
            ?? $this->string($record['external_id'] ?? $record['id'] ?? null);
    }

    private function requiredString(mixed $value): ?string
    {
        $string = $this->string($value);

        return $string === '' ? null : $string;
    }

    private function string(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_scalar($value)) {
            $trimmed = trim((string) $value);

            return $trimmed === '' ? null : $trimmed;
        }

        return null;
    }

    private function numeric(mixed $value): ?string
    {
        $string = $this->string($value);
        if ($string === null) {
            return null;
        }

        $normalized = str_replace(',', '', $string);

        return is_numeric($normalized) ? $normalized : null;
    }

    private function integer(mixed $value): ?int
    {
        $string = $this->numeric($value);

        return $string === null ? null : (int) $string;
    }

    private function date(mixed $value): ?string
    {
        $string = $this->string($value);
        if ($string === null) {
            return null;
        }

        try {
            return Carbon::parse($string)->toDateString();
        } catch (\Throwable) {
            return null;
        }
    }

    private function dateTime(mixed $value): ?string
    {
        $string = $this->string($value);
        if ($string === null) {
            return null;
        }

        try {
            return Carbon::parse($string)->toDateTimeString();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @return array<int, array{code: string, description: string}>|null
     */
    private function codes(mixed $value): ?array
    {
        if (! is_array($value)) {
            $string = $this->string($value);
            if ($string === null) {
                return null;
            }

            return array_map(
                static fn (string $code): array => ['code' => trim($code), 'description' => ''],
                array_filter(explode(',', $string), static fn (string $code): bool => trim($code) !== '')
            );
        }

        $codes = [];
        foreach ($value as $entry) {
            if (is_string($entry) && trim($entry) !== '') {
                $codes[] = ['code' => trim($entry), 'description' => ''];

                continue;
            }

            if (! is_array($entry)) {
                continue;
            }

            $code = $this->string($entry['code'] ?? null);
            if ($code === null) {
                continue;
            }

            $codes[] = [
                'code' => $code,
                'description' => $this->string($entry['description'] ?? $entry['display'] ?? null) ?? '',
            ];
        }

        return $codes === [] ? null : $codes;
    }

    private function documentStoragePath(int $patientId, string $filename): string
    {
        $safeName = Str::of($filename)
            ->replaceMatches('/[^\w.\-]+/', '_')
            ->trim('_')
            ->toString();

        return 'phr/documents/patients/'.$patientId.'/'.Str::uuid().'/'.($safeName !== '' ? $safeName : 'document');
    }

    private function mimeType(string $path): ?string
    {
        $mimeType = mime_content_type($path);

        return is_string($mimeType) ? $mimeType : null;
    }
}
