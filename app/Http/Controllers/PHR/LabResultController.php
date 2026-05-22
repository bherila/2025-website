<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\HandlesClinicalResourceRequests;
use App\Http\Requests\PHR\StoreLabResultRequest;
use App\Http\Resources\PHR\LabResultResource;
use App\Models\PhrPatient;
use App\Models\PhrLabResult;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Carbon;

class LabResultController extends Controller
{
    /** @use HandlesClinicalResourceRequests<PhrLabResult> */
    use HandlesClinicalResourceRequests;

    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        return $this->indexClinicalResource($request, $patient);
    }

    public function store(StoreLabResultRequest $request, int $patient): JsonResponse
    {
        return $this->storeClinicalResource($request, $patient);
    }

    public function show(Request $request, int $patient, int $labResult): JsonResponse
    {
        return $this->showClinicalResource($request, $patient, $labResult);
    }

    public function showPanel(Request $request, int $patient, int $labResult): JsonResponse
    {
        $userId = (int) $request->user()?->id;
        $resolvedPatient = $this->accessService()->accessiblePatient($patient, $userId);

        $anchor = PhrLabResult::query()
            ->where('patient_id', $resolvedPatient->id)
            ->findOrFail($labResult);

        $panelRows = $this->panelRowsForAnchor($resolvedPatient, $anchor);

        $rows = $panelRows
            ->map(function (PhrLabResult $result) use ($resolvedPatient): array {
                return [
                    'id' => $result->id,
                    'analyte' => $result->analyte,
                    'value' => $result->value,
                    'value_numeric' => $result->value_numeric,
                    'unit' => $result->unit,
                    'range_min' => $result->range_min,
                    'range_max' => $result->range_max,
                    'range_unit' => $result->range_unit,
                    'reference_range_text' => $result->reference_range_text,
                    'abnormal_flag' => $result->abnormal_flag,
                    'result_datetime' => $result->result_datetime?->toDateTimeString(),
                    'collection_datetime' => $result->collection_datetime?->toDateTimeString(),
                    'trend' => $this->trendForResult($resolvedPatient, $result),
                ];
            })
            ->values();

        return response()->json([
            'panel' => [
                'id' => $anchor->id,
                'panel_name' => $anchor->test_name,
                'collection_datetime' => $anchor->collection_datetime?->toDateTimeString(),
                'ordering_provider' => $anchor->ordering_provider,
                'resulting_lab' => $anchor->resulting_lab,
                'source' => $anchor->source,
                'source_document_id' => $anchor->source_document_id,
                'source_document_url' => $anchor->source_document_id
                    ? url("/api/phr/patients/{$resolvedPatient->id}/documents/{$anchor->source_document_id}/file")
                    : null,
                'rows' => $rows,
            ],
        ]);
    }

    public function update(StoreLabResultRequest $request, int $patient, int $labResult): JsonResponse
    {
        return $this->updateClinicalResource($request, $patient, $labResult);
    }

    public function destroy(Request $request, int $patient, int $labResult): Response
    {
        return $this->destroyClinicalResource($request, $patient, $labResult);
    }

    protected function accessService(): PhrPatientAccessService
    {
        return $this->accessService;
    }

    /**
     * @return class-string<PhrLabResult>
     */
    protected function modelClass(): string
    {
        return PhrLabResult::class;
    }

    protected function resourceClass(): string
    {
        return LabResultResource::class;
    }

    protected function collectionKey(): string
    {
        return 'lab_results';
    }

    protected function resourceKey(): string
    {
        return 'lab_result';
    }

    /**
     * @param  Builder<PhrLabResult>  $query
     * @return Builder<PhrLabResult>
     */
    protected function indexQuery(Builder $query): Builder
    {
        return $query
            ->orderByDesc('result_datetime')
            ->orderByDesc('collection_datetime')
            ->orderByDesc('id');
    }

    /**
     * @return \Illuminate\Support\Collection<int, PhrLabResult>
     */
    private function panelRowsForAnchor(PhrPatient $patient, PhrLabResult $anchor)
    {
        if ($anchor->test_name === null) {
            return collect([$anchor]);
        }

        $query = PhrLabResult::query()
            ->where('patient_id', $patient->id)
            ->where('test_name', $anchor->test_name);

        if ($anchor->collection_datetime !== null) {
            $query->where('collection_datetime', $anchor->collection_datetime);
        } elseif ($anchor->result_datetime !== null) {
            $query->where('result_datetime', $anchor->result_datetime);
        } else {
            $query->where('id', $anchor->id);
        }

        return $query
            ->orderBy('analyte')
            ->orderBy('id')
            ->get();
    }

    private function trendForResult(PhrPatient $patient, PhrLabResult $result): ?string
    {
        if ($result->analyte === null || $result->value_numeric === null) {
            return null;
        }

        $previous = PhrLabResult::query()
            ->where('patient_id', $patient->id)
            ->where('analyte', $result->analyte)
            ->whereNotNull('value_numeric')
            ->where('id', '!=', $result->id)
            ->orderByDesc('result_datetime')
            ->orderByDesc('collection_datetime')
            ->orderByDesc('id')
            ->get()
            ->first(fn (PhrLabResult $candidate): bool => $this->isOlderResult($candidate, $result));

        if (! $previous || $previous->value_numeric === null) {
            return null;
        }

        $current = (float) $result->value_numeric;
        $prior = (float) $previous->value_numeric;

        return match (true) {
            $current > $prior => 'up',
            $current < $prior => 'down',
            default => 'flat',
        };
    }

    private function isOlderResult(PhrLabResult $candidate, PhrLabResult $current): bool
    {
        $candidateAt = $candidate->result_datetime ?? $candidate->collection_datetime;
        $currentAt = $current->result_datetime ?? $current->collection_datetime;

        if ($candidateAt instanceof Carbon && $currentAt instanceof Carbon) {
            return $candidateAt->lessThan($currentAt)
                || ($candidateAt->equalTo($currentAt) && $candidate->id < $current->id);
        }

        if ($candidateAt instanceof Carbon) {
            return true;
        }

        if ($currentAt instanceof Carbon) {
            return false;
        }

        return $candidate->id < $current->id;
    }
}
