<?php

namespace App\Services\PHR\Import;

use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\PhrDocument;
use App\Models\PhrPatient;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class PhrStructuredDataImporter
{
    public const array JOB_TYPES = PhrRecordAttributeMapper::JOB_TYPES;

    public function __construct(
        private PhrRecordAttributeMapper $attributeMapper,
        private PhrDocumentImporter $documentImporter,
    ) {}

    public static function isPhrJobType(string $jobType): bool
    {
        return PhrRecordAttributeMapper::isPhrJobType($jobType);
    }

    /**
     * @return array<int, string>
     */
    public static function writableJobTypes(): array
    {
        return PhrRecordAttributeMapper::writableJobTypes();
    }

    /**
     * @param  array<array-key, mixed>  $payload
     * @param  array{import_source?: string, source?: string, external_id?: string|null, genai_job_id?: int|null, source_document_id?: int|null}  $options
     */
    public function importPayload(PhrPatient $patient, int $actorUserId, string $jobType, array $payload, array $options = []): PhrImportResult
    {
        if (! self::isPhrJobType($jobType)) {
            throw new InvalidArgumentException("Unsupported PHR job type: {$jobType}");
        }

        return DB::transaction(function () use ($patient, $actorUserId, $jobType, $payload, $options): PhrImportResult {
            if ($jobType === 'phr_document') {
                $document = $this->documentImporter->createOrUpdateDocument($patient, $actorUserId, $payload, $options);

                return new PhrImportResult(documents: 1, created: $document->wasRecentlyCreated ? 1 : 0, updated: $document->wasRecentlyCreated ? 0 : 1);
            }

            $result = new PhrImportResult;
            foreach ($this->attributeMapper->recordsFromPayload($jobType, $payload) as $record) {
                if (! is_array($record)) {
                    $result->addSkipped();

                    continue;
                }

                $attributes = $this->attributeMapper->attributesFor($patient, $actorUserId, $jobType, $record, $options);
                if ($attributes === [] || $this->attributeMapper->missingRequiredField($jobType, $attributes)) {
                    $result->addSkipped();

                    continue;
                }

                $model = $this->upsertModel($this->attributeMapper->modelClassFor($jobType), $attributes);
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
        return $this->documentImporter->storeLocalDocument($patient, $actorUserId, $path, $attributes);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function storeGenAiDocument(PhrPatient $patient, int $actorUserId, GenAiImportJob $job, array $payload): PhrDocument
    {
        return $this->documentImporter->storeGenAiDocument($patient, $actorUserId, $job, $payload);
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    public function updateDocumentFromGenAiResult(PhrDocument $document, GenAiImportJob $job, array $payload): PhrDocument
    {
        return $this->documentImporter->updateDocumentFromGenAiResult($document, $job, $payload);
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
            return $modelClass::query()->create($attributes);
        }

        $existing = $modelClass::query()->where($queryAttributes)->first();
        if ($existing !== null) {
            $existing->update($attributes);
            $existing->wasRecentlyCreated = false;

            return $existing;
        }

        return $modelClass::query()->create($attributes);
    }
}
