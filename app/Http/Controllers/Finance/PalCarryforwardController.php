<?php

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\StorePalCarryforwardRequest;
use App\Http\Requests\Finance\UpdatePalCarryforwardRequest;
use App\Models\FinanceTool\PalCarryforward;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PalCarryforwardController extends Controller
{
    /** GET /api/finance/{pal-carryforwards|tax-loss-carryforwards}?year=YYYY — list carryforwards for the year. */
    public function index(Request $request): JsonResponse
    {
        $year = (int) $request->query('year', date('Y'));

        $carryforwards = PalCarryforward::query()
            ->where('user_id', auth()->id())
            ->where('tax_year', $year)
            ->orderBy('activity_name')
            ->orderBy('id')
            ->get();

        return response()->json($carryforwards->map(fn (PalCarryforward $cf): array => $this->toResponseArray($cf)));
    }

    /** POST /api/finance/{pal-carryforwards|tax-loss-carryforwards} — create or update a carryforward entry. */
    public function store(StorePalCarryforwardRequest $request): JsonResponse
    {
        $attributes = [
            'user_id' => auth()->id(),
            'tax_year' => $request->integer('tax_year'),
            'activity_name' => (string) $request->string('activity_name'),
        ];

        $values = [
            'activity_ein' => $request->validated('activity_ein') ?? null,
            'ordinary_carryover' => (float) $request->validated('ordinary_carryover'),
            'short_term_carryover' => (float) ($request->validated('short_term_carryover') ?? 0),
            'long_term_carryover' => (float) ($request->validated('long_term_carryover') ?? 0),
        ];

        $existing = PalCarryforward::query()->where($attributes)->first();
        $carryforward = PalCarryforward::query()->updateOrCreate($attributes, $values);

        return response()->json($this->toResponseArray($carryforward), $existing === null ? 201 : 200);
    }

    /** PUT /api/finance/{pal-carryforwards|tax-loss-carryforwards}/{id} — update a carryforward entry. */
    public function update(UpdatePalCarryforwardRequest $request, int $id): JsonResponse
    {
        $carryforward = PalCarryforward::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id);

        $carryforward->update($request->validated());

        return response()->json($this->toResponseArray($carryforward));
    }

    /** DELETE /api/finance/{pal-carryforwards|tax-loss-carryforwards}/{id} — remove a carryforward entry. */
    public function destroy(int $id): JsonResponse
    {
        PalCarryforward::query()
            ->where('user_id', auth()->id())
            ->findOrFail($id)
            ->delete();

        return response()->json(['ok' => true]);
    }

    /** @return array{id:int,activity_name:string,activity_ein:?string,ordinary_carryover:float,short_term_carryover:float,long_term_carryover:float} */
    private function toResponseArray(PalCarryforward $cf): array
    {
        return [
            'id' => $cf->id,
            'activity_name' => $cf->activity_name,
            'activity_ein' => $cf->activity_ein,
            'ordinary_carryover' => round($cf->ordinary_carryover, 2),
            'short_term_carryover' => round($cf->short_term_carryover, 2),
            'long_term_carryover' => round($cf->long_term_carryover, 2),
        ];
    }
}
