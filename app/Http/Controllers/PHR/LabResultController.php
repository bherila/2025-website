<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\HandlesClinicalResourceRequests;
use App\Http\Requests\PHR\StoreLabResultRequest;
use App\Http\Resources\PHR\LabResultResource;
use App\Models\PhrLabResult;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

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
}
