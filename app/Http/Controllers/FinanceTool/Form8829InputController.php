<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\UpsertForm8829InputRequest;
use App\Models\FinanceTool\FinEmploymentEntity;
use App\Models\FinanceTool\FinForm8829Input;
use App\Support\Finance\TaxYearRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class Form8829InputController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $year = $request->integer('year', (int) date('Y'));
        $entityId = $request->integer('entity_id');

        if ($year < TaxYearRange::MIN || $year > TaxYearRange::MAX) {
            return response()->json(['message' => 'Invalid tax year.'], 422);
        }

        if ($entityId > 0) {
            $entity = $this->scheduleCEntity($entityId);
            $input = FinForm8829Input::query()
                ->where('employment_entity_id', $entity->id)
                ->where('tax_year', $year)
                ->first();

            return response()->json($input instanceof FinForm8829Input ? $this->toResponseArray($input) : $this->defaultResponseArray($entity->id, $year));
        }

        $inputs = FinForm8829Input::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', $year)
            ->orderBy('employment_entity_id')
            ->get()
            ->map(fn (FinForm8829Input $input): array => $this->toResponseArray($input))
            ->values();

        return response()->json($inputs);
    }

    public function upsert(UpsertForm8829InputRequest $request): JsonResponse
    {
        $data = $request->validated();
        $entity = $this->scheduleCEntity((int) $data['entity_id']);

        $input = FinForm8829Input::query()->updateOrCreate(
            [
                'user_id' => auth()->id(),
                'employment_entity_id' => $entity->id,
                'tax_year' => (int) $data['tax_year'],
            ],
            [
                'method' => $data['method'],
                'office_sqft' => $data['office_sqft'] ?? null,
                'home_sqft' => $data['home_sqft'] ?? null,
                'months_used' => (int) $data['months_used'],
                'prior_year_op_carryover' => (float) ($data['prior_year_op_carryover'] ?? 0),
                'prior_year_op_carryover_ca' => (float) ($data['prior_year_op_carryover_ca'] ?? 0),
                'prior_year_depreciation_carryover' => (float) ($data['prior_year_depreciation_carryover'] ?? 0),
                'prior_year_depreciation_carryover_ca' => (float) ($data['prior_year_depreciation_carryover_ca'] ?? 0),
                'notes' => $data['notes'] ?? null,
            ],
        );

        return response()->json($this->toResponseArray($input));
    }

    private function scheduleCEntity(int $id): FinEmploymentEntity
    {
        return FinEmploymentEntity::query()
            ->where('user_id', auth()->id())
            ->where('type', 'sch_c')
            ->findOrFail($id);
    }

    /**
     * @return array{id:null,employment_entity_id:int,tax_year:int,method:string,office_sqft:null,home_sqft:null,months_used:int,prior_year_op_carryover:float,prior_year_op_carryover_ca:float,prior_year_depreciation_carryover:float,prior_year_depreciation_carryover_ca:float,notes:null}
     */
    private function defaultResponseArray(int $entityId, int $year): array
    {
        return [
            'id' => null,
            'employment_entity_id' => $entityId,
            'tax_year' => $year,
            'method' => 'regular',
            'office_sqft' => null,
            'home_sqft' => null,
            'months_used' => 12,
            'prior_year_op_carryover' => 0.0,
            'prior_year_op_carryover_ca' => 0.0,
            'prior_year_depreciation_carryover' => 0.0,
            'prior_year_depreciation_carryover_ca' => 0.0,
            'notes' => null,
        ];
    }

    /**
     * @return array{id:int,employment_entity_id:int,tax_year:int,method:string,office_sqft:?float,home_sqft:?float,months_used:int,prior_year_op_carryover:float,prior_year_op_carryover_ca:float,prior_year_depreciation_carryover:float,prior_year_depreciation_carryover_ca:float,notes:?string}
     */
    private function toResponseArray(FinForm8829Input $input): array
    {
        return [
            'id' => $input->id,
            'employment_entity_id' => $input->employment_entity_id,
            'tax_year' => $input->tax_year,
            'method' => $input->method,
            'office_sqft' => $input->office_sqft,
            'home_sqft' => $input->home_sqft,
            'months_used' => $input->months_used,
            'prior_year_op_carryover' => round($input->prior_year_op_carryover, 2),
            'prior_year_op_carryover_ca' => round($input->prior_year_op_carryover_ca, 2),
            'prior_year_depreciation_carryover' => round($input->prior_year_depreciation_carryover, 2),
            'prior_year_depreciation_carryover_ca' => round($input->prior_year_depreciation_carryover_ca, 2),
            'notes' => $input->notes,
        ];
    }
}
