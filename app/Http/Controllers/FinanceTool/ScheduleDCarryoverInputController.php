<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\UpsertScheduleDCarryoverInputRequest;
use App\Models\FinanceTool\ScheduleDCarryoverInput;
use App\Support\Finance\TaxYearRange;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScheduleDCarryoverInputController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $year = $request->integer('year', (int) date('Y'));

        if ($year < TaxYearRange::MIN || $year > TaxYearRange::MAX) {
            return response()->json(['message' => 'Invalid tax year.'], 422);
        }

        $input = ScheduleDCarryoverInput::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', $year)
            ->first();

        return response()->json($input instanceof ScheduleDCarryoverInput
            ? $this->toResponseArray($input)
            : $this->defaultResponseArray($year));
    }

    public function upsert(UpsertScheduleDCarryoverInputRequest $request): JsonResponse
    {
        $data = $request->validated();

        $input = ScheduleDCarryoverInput::query()->updateOrCreate(
            [
                'user_id' => auth()->id(),
                'tax_year' => (int) $data['tax_year'],
            ],
            [
                'short_term_loss_carryover' => (float) ($data['short_term_loss_carryover'] ?? 0),
                'long_term_loss_carryover' => (float) ($data['long_term_loss_carryover'] ?? 0),
                'notes' => $data['notes'] ?? null,
            ],
        );

        return response()->json($this->toResponseArray($input));
    }

    /**
     * @return array{id:null,tax_year:int,short_term_loss_carryover:float,long_term_loss_carryover:float,notes:null}
     */
    private function defaultResponseArray(int $year): array
    {
        return [
            'id' => null,
            'tax_year' => $year,
            'short_term_loss_carryover' => 0.0,
            'long_term_loss_carryover' => 0.0,
            'notes' => null,
        ];
    }

    /**
     * @return array{id:int,tax_year:int,short_term_loss_carryover:float,long_term_loss_carryover:float,notes:?string}
     */
    private function toResponseArray(ScheduleDCarryoverInput $input): array
    {
        return [
            'id' => $input->id,
            'tax_year' => $input->tax_year,
            'short_term_loss_carryover' => round($input->short_term_loss_carryover, 2),
            'long_term_loss_carryover' => round($input->long_term_loss_carryover, 2),
            'notes' => $input->notes,
        ];
    }
}
