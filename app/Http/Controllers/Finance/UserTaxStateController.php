<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StoreUserTaxStateRequest;
use App\Models\FinanceTool\UserTaxState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserTaxStateController extends Controller
{
    /** GET /api/finance/user-tax-states?year=YYYY — list active states for the year. */
    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', date('Y'));

        $states = UserTaxState::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', $year)
            ->pluck('state_code');

        return response()->json($states);
    }

    /** POST /api/finance/user-tax-states — add a state for a tax year. */
    public function store(StoreUserTaxStateRequest $request): JsonResponse
    {
        $validated = $request->validated();

        UserTaxState::firstOrCreate([
            'user_id' => auth()->id(),
            'tax_year' => $validated['tax_year'],
            'state_code' => strtoupper($validated['state_code']),
        ]);

        return response()->json(['ok' => true], 201);
    }

    /** DELETE /api/finance/user-tax-states/{stateCode}?year=YYYY — remove a state. */
    public function destroy(Request $request, string $stateCode): JsonResponse
    {
        $request->validate([
            'year' => ['required', 'integer', 'min:2018', 'max:2030'],
        ]);

        UserTaxState::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', (int) $request->query('year'))
            ->where('state_code', strtoupper($stateCode))
            ->delete();

        return response()->json(['ok' => true]);
    }
}
