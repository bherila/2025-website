<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinEmploymentEntity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class FinanceEmploymentEntityController extends Controller
{
    /** Shared validation rules for create and update. */
    private function rules(): array
    {
        return [
            'display_name' => 'required|string|max:255',
            'start_date' => 'required|date',
            'end_date' => 'nullable|date|after_or_equal:start_date',
            'is_current' => 'boolean',
            'ein' => 'nullable|string|max:20',
            'address' => 'nullable|string',
            'type' => 'required|in:sch_c,w2,hobby',
            'sic_code' => 'nullable|integer',
            'is_spouse' => 'boolean',
            'is_hidden' => 'boolean',
        ];
    }

    /** Normalize is_current/end_date consistency and validate sic_code. */
    private function normalize(array $data, string $type): array
    {
        if (! empty($data['is_current'])) {
            $data['end_date'] = null;
        } elseif (! empty($data['end_date'])) {
            $data['is_current'] = false;
        }

        return $data;
    }

    public function index(Request $request)
    {
        $query = FinEmploymentEntity::where('user_id', Auth::id())
            ->orderBy('start_date', 'desc');

        // By default return all entities (including hidden) so the Settings page
        // can manage them. Pass ?visible_only=true to exclude hidden entities
        // (used by dropdowns in payslip forms, tag editor, etc.).
        if ($request->boolean('visible_only')) {
            $query->where('is_hidden', false);
        }

        return response()->json($query->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules());

        if (($data['type'] ?? null) !== 'sch_c' && ! empty($data['sic_code'])) {
            return response()->json(['errors' => ['sic_code' => ['SIC code is only allowed for Schedule C entities.']]], 422);
        }

        $data['user_id'] = Auth::id();
        $data = $this->normalize($data, $data['type']);

        return response()->json(FinEmploymentEntity::create($data), 201);
    }

    public function update(Request $request, $id)
    {
        $entity = FinEmploymentEntity::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        if ($request->has('type') && $request->input('type') !== $entity->type) {
            return response()->json(['error' => 'The entity type cannot be changed after creation.'], 422);
        }

        $data = $request->validate($this->rules());

        if (($data['type'] ?? $entity->type) !== 'sch_c' && ! empty($data['sic_code'])) {
            return response()->json(['errors' => ['sic_code' => ['SIC code is only allowed for Schedule C entities.']]], 422);
        }

        unset($data['type']); // type is immutable

        $entity->update($this->normalize($data, $entity->type));

        return response()->json($entity->fresh());
    }

    public function destroy($id)
    {
        $entity = FinEmploymentEntity::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $entity->delete();

        return response()->json(['success' => true]);
    }

    public function getMarriageStatus()
    {
        return response()->json(Auth::user()->marriage_status_by_year ?? []);
    }

    public function updateMarriageStatus(Request $request)
    {
        $data = $request->validate([
            'year' => 'required|integer|min:1900|max:2100',
            'is_married' => 'required|boolean',
        ]);

        $year = (string) $data['year'];
        $uid = Auth::id();

        if (! $data['is_married']) {
            $hasSpouse = FinEmploymentEntity::where('user_id', $uid)
                ->where('is_spouse', true)
                ->where('start_date', '<=', $year.'-12-31')
                ->where(fn ($q) => $q->whereNull('end_date')->orWhere('end_date', '>=', $year.'-01-01'))
                ->exists();

            if ($hasSpouse) {
                return response()->json([
                    'error' => 'Cannot set marriage status to unmarried for '.$year.' because there are spouse employment entities that overlap with that year. Remove or update those entities first.',
                ], 422);
            }
        }

        $user = Auth::user();
        $statusByYear = $user->marriage_status_by_year ?? [];
        $statusByYear[$year] = $data['is_married'];
        $user->marriage_status_by_year = $statusByYear;
        $user->save();

        return response()->json($statusByYear);
    }
}
