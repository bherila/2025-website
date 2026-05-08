<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\UpsertEmploymentEntityYearRequest;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinEmploymentEntityYear;
use App\Support\Finance\TaxYearRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EmploymentEntityYearController extends Controller
{
    public function index(Request $request, int $id): JsonResponse
    {
        $entity = $this->scheduleCEntity($id);
        $year = $request->integer('year');

        $query = FinEmploymentEntityYear::query()
            ->where('employment_entity_id', $entity->id)
            ->orderByDesc('tax_year');

        if ($request->filled('year')) {
            if ($year < TaxYearRange::MIN || $year > TaxYearRange::MAX) {
                return response()->json(['message' => 'Invalid tax year.'], 422);
            }

            $query->where('tax_year', $year);
        }

        return response()->json(
            $query->get()->map(fn (FinEmploymentEntityYear $entityYear): array => $this->toResponseArray($entityYear))->values(),
        );
    }

    public function store(UpsertEmploymentEntityYearRequest $request, int $id): JsonResponse
    {
        $entity = $this->scheduleCEntity($id);
        $data = $request->validated();

        $entityYear = FinEmploymentEntityYear::query()->updateOrCreate(
            [
                'employment_entity_id' => $entity->id,
                'tax_year' => (int) $data['tax_year'],
            ],
            $this->values($data),
        );

        return response()->json($this->toResponseArray($entityYear));
    }

    public function update(UpsertEmploymentEntityYearRequest $request, int $id, int $year): JsonResponse
    {
        $entity = $this->scheduleCEntity($id);
        $data = $request->validated();

        $entityYear = FinEmploymentEntityYear::query()->updateOrCreate(
            [
                'employment_entity_id' => $entity->id,
                'tax_year' => $year,
            ],
            $this->values($data),
        );

        return response()->json($this->toResponseArray($entityYear));
    }

    public function destroy(int $id, int $year): JsonResponse
    {
        $entity = $this->scheduleCEntity($id);

        FinEmploymentEntityYear::query()
            ->where('employment_entity_id', $entity->id)
            ->where('tax_year', $year)
            ->firstOrFail()
            ->delete();

        return response()->json(['ok' => true]);
    }

    private function scheduleCEntity(int $id): FinEmploymentEntity
    {
        return FinEmploymentEntity::query()
            ->where('user_id', auth()->id())
            ->where('type', 'sch_c')
            ->findOrFail($id);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function values(array $data): array
    {
        return [
            'accounting_method' => $data['accounting_method'] ?? 'cash',
            'materially_participated' => (bool) ($data['materially_participated'] ?? true),
            'made_payments_requiring_1099' => (bool) ($data['made_payments_requiring_1099'] ?? false),
            'filed_required_1099s' => $data['filed_required_1099s'] ?? null,
            'started_or_acquired_this_year' => (bool) ($data['started_or_acquired_this_year'] ?? false),
            'principal_product_service' => $data['principal_product_service'] ?? null,
            'business_code' => $data['business_code'] ?? null,
            'notes' => $data['notes'] ?? null,
        ];
    }

    /**
     * @return array{id:int,employment_entity_id:int,tax_year:int,accounting_method:string,materially_participated:bool,made_payments_requiring_1099:bool,filed_required_1099s:?bool,started_or_acquired_this_year:bool,principal_product_service:?string,business_code:?string,notes:?string}
     */
    private function toResponseArray(FinEmploymentEntityYear $entityYear): array
    {
        return [
            'id' => $entityYear->id,
            'employment_entity_id' => $entityYear->employment_entity_id,
            'tax_year' => $entityYear->tax_year,
            'accounting_method' => $entityYear->accounting_method,
            'materially_participated' => $entityYear->materially_participated,
            'made_payments_requiring_1099' => $entityYear->made_payments_requiring_1099,
            'filed_required_1099s' => $entityYear->filed_required_1099s,
            'started_or_acquired_this_year' => $entityYear->started_or_acquired_this_year,
            'principal_product_service' => $entityYear->principal_product_service,
            'business_code' => $entityYear->business_code,
            'notes' => $entityYear->notes,
        ];
    }
}
