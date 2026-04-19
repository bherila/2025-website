<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
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

        return response()->json($deductions);
    }

    /** POST /api/finance/user-deductions — add a deduction. */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tax_year' => ['required', 'integer', 'min:2018', 'max:2030'],
            'category' => ['required', 'string', 'in:real_estate_tax,state_est_tax,sales_tax,mortgage_interest,charitable_cash,charitable_noncash,other'],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0.01'],
        ]);

        $deduction = UserDeduction::create([
            'user_id' => auth()->id(),
            ...$validated,
        ]);

        return response()->json($deduction, 201);
    }

    /** PUT /api/finance/user-deductions/{id} — update a deduction. */
    public function update(Request $request, int $id): JsonResponse
    {
        $deduction = UserDeduction::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id);

        $validated = $request->validate([
            'category' => ['sometimes', 'string', 'in:real_estate_tax,state_est_tax,sales_tax,mortgage_interest,charitable_cash,charitable_noncash,other'],
            'description' => ['nullable', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0.01'],
        ]);

        $deduction->update($validated);

        return response()->json($deduction);
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
}
