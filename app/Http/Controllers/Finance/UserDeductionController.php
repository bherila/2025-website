<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StoreUserDeductionRequest;
use App\Http\Requests\Finance\UpdateUserDeductionRequest;
use App\Models\FinanceTool\UserDeduction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserDeductionController extends Controller
{
    /** GET /api/finance/user-deductions?year=YYYY — list deductions for the year. */
    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', date('Y'));

        $deductions = UserDeduction::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', $year)
            ->orderBy('category')
            ->orderBy('id')
            ->get(['id', 'category', 'description', 'amount']);

        return response()->json($deductions->map(fn (UserDeduction $deduction): array => $this->toResponseArray($deduction)));
    }

    /** POST /api/finance/user-deductions — add a deduction. */
    public function store(StoreUserDeductionRequest $request): JsonResponse
    {
        $deduction = UserDeduction::create([
            'user_id' => auth()->id(),
            ...$request->validated(),
        ]);

        return response()->json($this->toResponseArray($deduction), 201);
    }

    /** PUT /api/finance/user-deductions/{id} — update a deduction. */
    public function update(UpdateUserDeductionRequest $request, int $id): JsonResponse
    {
        $deduction = UserDeduction::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id);

        $deduction->update($request->validated());

        return response()->json($this->toResponseArray($deduction));
    }

    /** DELETE /api/finance/user-deductions/{id} — remove a deduction. */
    public function destroy(int $id): JsonResponse
    {
        UserDeduction::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id)
            ->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array{id:int,category:string,description:?string,amount:float} */
    private function toResponseArray(UserDeduction $deduction): array
    {
        return [
            'id' => $deduction->id,
            'category' => $deduction->category,
            'description' => $deduction->description,
            'amount' => round($deduction->amount, 2),
        ];
    }
}
