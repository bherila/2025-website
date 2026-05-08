<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StoreTaxLineAdjustmentRequest;
use App\Http\Requests\Finance\UpdateTaxLineAdjustmentRequest;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinTaxLineAdjustment;
use App\Support\Finance\TaxYearRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TaxLineAdjustmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $year = $request->integer('year', (int) date('Y'));
        if ($year < TaxYearRange::MIN || $year > TaxYearRange::MAX) {
            return response()->json(['message' => 'Invalid tax year.'], 422);
        }

        $query = FinTaxLineAdjustment::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', $year)
            ->orderBy('form')
            ->orderBy('line_ref')
            ->orderBy('id');

        if ($request->filled('form')) {
            $query->where('form', (string) $request->query('form'));
        }

        if ($request->filled('entity_id')) {
            $query->where('entity_id', $request->integer('entity_id'));
        }

        return response()->json(
            $query->get()->map(fn (FinTaxLineAdjustment $adjustment): array => $this->toResponseArray($adjustment))->values(),
        );
    }

    public function store(StoreTaxLineAdjustmentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $entityId = $this->authorizedEntityId($data['entity_id'] ?? null);

        $adjustment = FinTaxLineAdjustment::query()->create([
            'user_id' => auth()->id(),
            'tax_year' => (int) $data['tax_year'],
            'form' => $data['form'],
            'entity_id' => $entityId,
            'line_ref' => $data['line_ref'],
            'kind' => $data['kind'],
            'amount' => $data['amount'] ?? null,
            'description' => $data['description'] ?? null,
            'status' => $data['status'] ?? 'open',
        ]);

        return response()->json($this->toResponseArray($adjustment), 201);
    }

    public function update(UpdateTaxLineAdjustmentRequest $request, int $id): JsonResponse
    {
        $adjustment = FinTaxLineAdjustment::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id);

        $adjustment->update($request->validated());

        return response()->json($this->toResponseArray($adjustment));
    }

    public function destroy(int $id): JsonResponse
    {
        FinTaxLineAdjustment::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id)
            ->delete();

        return response()->json(['ok' => true]);
    }

    private function authorizedEntityId(mixed $entityId): ?int
    {
        if ($entityId === null || $entityId === '') {
            return null;
        }

        $entity = FinEmploymentEntity::query()
            ->where('user_id', auth()->id())
            ->where('type', 'sch_c')
            ->findOrFail((int) $entityId);

        return (int) $entity->id;
    }

    /**
     * @return array{id:int,tax_year:int,form:string,entity_id:?int,line_ref:string,kind:string,amount:?float,description:?string,status:string}
     */
    private function toResponseArray(FinTaxLineAdjustment $adjustment): array
    {
        return [
            'id' => $adjustment->id,
            'tax_year' => $adjustment->tax_year,
            'form' => $adjustment->form,
            'entity_id' => $adjustment->entity_id,
            'line_ref' => $adjustment->line_ref,
            'kind' => $adjustment->kind,
            'amount' => $adjustment->amount !== null ? round($adjustment->amount, 2) : null,
            'description' => $adjustment->description,
            'status' => $adjustment->status,
        ];
    }
}
