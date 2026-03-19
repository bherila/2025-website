<?php

namespace App\Http\Controllers\FinanceTool;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinEmploymentEntity;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class FinanceEmploymentEntityController extends Controller
{
    public function index()
    {
        try {
            $uid = Auth::id();
            $entities = FinEmploymentEntity::where('user_id', $uid)
                ->orderBy('start_date', 'desc')
                ->get();

            return response()->json($entities);
        } catch (\Exception $e) {
            Log::error('Failed to fetch employment entities: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch employment entities'], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $validator = Validator::make($request->all(), [
                'display_name' => 'required|string|max:255',
                'start_date' => 'required|date',
                'end_date' => 'nullable|date|after_or_equal:start_date',
                'is_current' => 'boolean',
                'ein' => 'nullable|string|max:20',
                'address' => 'nullable|string',
                'type' => 'required|in:sch_c,w2,hobby',
                'sic_code' => 'nullable|integer',
                'is_spouse' => 'boolean',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $data = $validator->validated();

            // sic_code is only allowed for sch_c type
            if (($data['type'] ?? null) !== 'sch_c' && ! empty($data['sic_code'])) {
                return response()->json(['errors' => ['sic_code' => ['SIC code is only allowed for Schedule C entities.']]], 422);
            }

            // If is_current is true, clear end_date
            if (! empty($data['is_current'])) {
                $data['end_date'] = null;
            }

            // If end_date is set, force is_current to false
            if (! empty($data['end_date'])) {
                $data['is_current'] = false;
            }

            $entity = FinEmploymentEntity::create($data);

            return response()->json($entity, 201);
        } catch (\Exception $e) {
            Log::error('Failed to create employment entity: '.$e->getMessage());

            return response()->json(['error' => 'Failed to create employment entity'], 500);
        }
    }

    public function update(Request $request, $id)
    {
        try {
            $uid = Auth::id();
            $entity = FinEmploymentEntity::where('id', $id)
                ->where('user_id', $uid)
                ->first();

            if (! $entity) {
                return response()->json(['error' => 'Employment entity not found'], 404);
            }

            // Reject attempts to change type
            if ($request->has('type') && $request->input('type') !== $entity->type) {
                return response()->json(['error' => 'The entity type cannot be changed after creation.'], 422);
            }

            $validator = Validator::make($request->all(), [
                'display_name' => 'required|string|max:255',
                'start_date' => 'required|date',
                'end_date' => 'nullable|date|after_or_equal:start_date',
                'is_current' => 'boolean',
                'ein' => 'nullable|string|max:20',
                'address' => 'nullable|string',
                'type' => 'required|in:sch_c,w2,hobby',
                'sic_code' => 'nullable|integer',
                'is_spouse' => 'boolean',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $data = $validator->validated();

            // sic_code is only allowed for sch_c type
            if (($data['type'] ?? $entity->type) !== 'sch_c' && ! empty($data['sic_code'])) {
                return response()->json(['errors' => ['sic_code' => ['SIC code is only allowed for Schedule C entities.']]], 422);
            }

            // Remove type from update data since it cannot be changed
            unset($data['type']);

            // If is_current is true, clear end_date
            if (! empty($data['is_current'])) {
                $data['end_date'] = null;
            }

            // If end_date is set, force is_current to false
            if (! empty($data['end_date'])) {
                $data['is_current'] = false;
            }

            $entity->update($data);

            return response()->json($entity->fresh());
        } catch (\Exception $e) {
            Log::error('Failed to update employment entity: '.$e->getMessage());

            return response()->json(['error' => 'Failed to update employment entity'], 500);
        }
    }

    public function destroy($id)
    {
        try {
            $uid = Auth::id();
            $entity = FinEmploymentEntity::where('id', $id)
                ->where('user_id', $uid)
                ->first();

            if (! $entity) {
                return response()->json(['error' => 'Employment entity not found'], 404);
            }

            $entity->delete();

            return response()->json(['success' => true]);
        } catch (\Exception $e) {
            Log::error('Failed to delete employment entity: '.$e->getMessage());

            return response()->json(['error' => 'Failed to delete employment entity'], 500);
        }
    }

    public function getMarriageStatus()
    {
        try {
            $user = Auth::user();
            $statusByYear = $user->marriage_status_by_year;

            if (is_string($statusByYear)) {
                $statusByYear = json_decode($statusByYear, true) ?? [];
            }

            return response()->json($statusByYear ?? []);
        } catch (\Exception $e) {
            Log::error('Failed to fetch marriage status: '.$e->getMessage());

            return response()->json(['error' => 'Failed to fetch marriage status'], 500);
        }
    }

    public function updateMarriageStatus(Request $request)
    {
        try {
            $validator = Validator::make($request->all(), [
                'year' => 'required|integer|min:1900|max:2100',
                'is_married' => 'required|boolean',
            ]);

            if ($validator->fails()) {
                return response()->json(['errors' => $validator->errors()], 422);
            }

            $data = $validator->validated();
            $year = (string) $data['year'];
            $isMarried = $data['is_married'];
            $uid = Auth::id();

            // If unmarrying, check for spouse employment entities that overlap with that year
            if (! $isMarried) {
                $spouseEntities = FinEmploymentEntity::where('user_id', $uid)
                    ->where('is_spouse', true)
                    ->where('start_date', '<=', $year.'-12-31')
                    ->where(function ($query) use ($year) {
                        $query->whereNull('end_date')
                            ->orWhere('end_date', '>=', $year.'-01-01');
                    })
                    ->exists();

                if ($spouseEntities) {
                    return response()->json([
                        'error' => 'Cannot set marriage status to unmarried for '.$year.' because there are spouse employment entities that overlap with that year. Remove or update those entities first.',
                    ], 422);
                }
            }

            $user = Auth::user();
            $statusByYear = $user->marriage_status_by_year;

            if (is_string($statusByYear)) {
                $statusByYear = json_decode($statusByYear, true) ?? [];
            }

            $statusByYear[$year] = $isMarried;

            $user->marriage_status_by_year = json_encode($statusByYear);
            $user->save();

            return response()->json($statusByYear);
        } catch (\Exception $e) {
            Log::error('Failed to update marriage status: '.$e->getMessage());

            return response()->json(['error' => 'Failed to update marriage status'], 500);
        }
    }
}
