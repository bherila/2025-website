<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\HandlesClinicalResourceRequests;
use App\Http\Requests\PHR\StoreVitalRequest;
use App\Http\Resources\PHR\VitalResource;
use App\Models\PhrPatientVital;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class VitalController extends Controller
{
    /** @use HandlesClinicalResourceRequests<PhrPatientVital> */
    use HandlesClinicalResourceRequests;

    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(Request $request, int $patient): JsonResponse
    {
        return $this->indexClinicalResource($request, $patient);
    }

    public function store(StoreVitalRequest $request, int $patient): JsonResponse
    {
        return $this->storeClinicalResource($request, $patient);
    }

    public function show(Request $request, int $patient, int $vital): JsonResponse
    {
        return $this->showClinicalResource($request, $patient, $vital);
    }

    public function update(StoreVitalRequest $request, int $patient, int $vital): JsonResponse
    {
        return $this->updateClinicalResource($request, $patient, $vital);
    }

    public function destroy(Request $request, int $patient, int $vital): Response
    {
        return $this->destroyClinicalResource($request, $patient, $vital);
    }

    protected function accessService(): PhrPatientAccessService
    {
        return $this->accessService;
    }

    /**
     * @return class-string<PhrPatientVital>
     */
    protected function modelClass(): string
    {
        return PhrPatientVital::class;
    }

    protected function resourceClass(): string
    {
        return VitalResource::class;
    }

    protected function collectionKey(): string
    {
        return 'vitals';
    }

    protected function resourceKey(): string
    {
        return 'vital';
    }

    /**
     * @param  Builder<PhrPatientVital>  $query
     * @return Builder<PhrPatientVital>
     */
    protected function indexQuery(Builder $query): Builder
    {
        return $query
            ->orderByDesc('observed_at')
            ->orderByDesc('vital_date')
            ->orderByDesc('id');
    }
}
