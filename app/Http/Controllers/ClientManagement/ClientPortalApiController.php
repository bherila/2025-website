<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\RolloverCalculator;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class ClientPortalApiController extends Controller
{
    /**
     * Get company data by slug.
     */
    public function getCompany($slug)
    {
        $company = ClientCompany::where('slug', $slug)->with('users')->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        return response()->json($company);
    }

    /**
     * Get all projects for a company.
     */
    public function getProjects($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $projects = ClientProject::where('client_company_id', $company->id)
                          ->withCount(['tasks', 'timeEntries'])
                          ->orderBy('name')
                          ->get();
        
        return response()->json($projects);
    }

    /**
     * Create a new project.
     */
    public function createProject(Request $request, $slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);
        
        $projectSlug = ClientProject::generateSlug($validated['name']);
        
        // Ensure unique slug
        $baseSlug = $projectSlug;
        $counter = 1;
        while (ClientProject::where('slug', $projectSlug)->exists()) {
            $projectSlug = $baseSlug . '-' . $counter;
            $counter++;
        }
        
        $project = ClientProject::create([
            'client_company_id' => $company->id,
            'name' => $validated['name'],
            'slug' => $projectSlug,
            'description' => $validated['description'] ?? null,
            'creator_user_id' => Auth::id(),
        ]);
        
        return response()->json($project, 201);
    }

    /**
     * Get all tasks for a project.
     */
    public function getTasks($slug, $projectSlug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $project = ClientProject::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $tasks = ClientTask::where('project_id', $project->id)
                    ->with(['assignee:id,name,email', 'creator:id,name'])
                    ->orderByRaw('completed_at IS NOT NULL')
                    ->orderBy('is_high_priority', 'desc')
                    ->orderBy('created_at', 'desc')
                    ->get();
        
        return response()->json($tasks);
    }

    /**
     * Create a new task.
     */
    public function createTask(Request $request, $slug, $projectSlug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $project = ClientProject::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'due_date' => 'nullable|date',
            'assignee_user_id' => 'nullable|exists:users,id',
            'is_high_priority' => 'boolean',
            'is_hidden_from_clients' => 'boolean',
        ]);
        
        $task = ClientTask::create([
            'project_id' => $project->id,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
            'due_date' => $validated['due_date'] ?? null,
            'assignee_user_id' => $validated['assignee_user_id'] ?? null,
            'creator_user_id' => Auth::id(),
            'is_high_priority' => $validated['is_high_priority'] ?? false,
            'is_hidden_from_clients' => $validated['is_hidden_from_clients'] ?? false,
        ]);
        
        return response()->json($task->load(['assignee:id,name,email', 'creator:id,name']), 201);
    }

    /**
     * Update a task.
     */
    public function updateTask(Request $request, $slug, $projectSlug, $taskId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $project = ClientProject::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $task = ClientTask::where('project_id', $project->id)->findOrFail($taskId);
        
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'due_date' => 'nullable|date',
            'assignee_user_id' => 'nullable|exists:users,id',
            'is_high_priority' => 'boolean',
            'is_hidden_from_clients' => 'boolean',
            'completed' => 'boolean',
        ]);
        
        if (isset($validated['completed'])) {
            if ($validated['completed']) {
                $task->completed_at = now();
            } else {
                $task->completed_at = null;
            }
            unset($validated['completed']);
        }
        
        $task->update($validated);
        
        return response()->json($task->fresh(['assignee:id,name,email', 'creator:id,name']));
    }

    /**
     * Delete a task.
     */
    public function deleteTask($slug, $projectSlug, $taskId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $project = ClientProject::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $task = ClientTask::where('project_id', $project->id)->findOrFail($taskId);
        $task->delete();
        
        return response()->json(['success' => true]);
    }

    /**
     * Get all time entries for a company, grouped by month with hour balance info.
     */
    public function getTimeEntries($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $entries = ClientTimeEntry::where('client_company_id', $company->id)
                           ->with(['user:id,name,email', 'project:id,name,slug', 'task:id,name'])
                           ->orderBy('date_worked', 'desc')
                           ->orderBy('created_at', 'desc')
                           ->get()
                           ->map(function ($entry) {
                               $entry->formatted_time = $entry->formatted_time;
                               return $entry;
                           });
        
        // Calculate totals
        $totalMinutes = $entries->sum('minutes_worked');
        $billableMinutes = $entries->where('is_billable', true)->sum('minutes_worked');
        
        // Group entries by month and calculate rollover balances
        $monthlyData = $this->calculateMonthlyBalances($company, $entries);
        
        return response()->json([
            'entries' => $entries,
            'monthly_data' => $monthlyData,
            'total_time' => ClientTimeEntry::formatMinutesAsTime($totalMinutes),
            'total_minutes' => $totalMinutes,
            'billable_time' => ClientTimeEntry::formatMinutesAsTime($billableMinutes),
            'billable_minutes' => $billableMinutes,
        ]);
    }

    /**
     * Calculate monthly hour balances with rollover information.
     */
    protected function calculateMonthlyBalances(ClientCompany $company, $entries): array
    {
        // Group entries by month
        $entriesByMonth = $entries->groupBy(function ($entry) {
            return $entry->date_worked->format('Y-m');
        });

        // Get the active agreement (or agreements over time)
        $agreement = $company->activeAgreement();
        
        if (!$agreement) {
            // No agreement - just return month groupings without balance calculations
            return $entriesByMonth->map(function ($monthEntries, $yearMonth) {
                $billableMinutes = $monthEntries->where('is_billable', true)->sum('minutes_worked');
                return [
                    'year_month' => $yearMonth,
                    'has_agreement' => false,
                    'entries_count' => $monthEntries->count(),
                    'hours_worked' => round($billableMinutes / 60, 2),
                    'formatted_hours' => ClientTimeEntry::formatMinutesAsTime($billableMinutes),
                    'opening' => null,
                    'closing' => null,
                ];
            })->values()->toArray();
        }

        // Build monthly hours data for calculator
        $monthKeys = $entriesByMonth->keys()->sort()->values();
        $months = [];
        
        foreach ($monthKeys as $yearMonth) {
            $monthEntries = $entriesByMonth[$yearMonth];
            $billableMinutes = $monthEntries->where('is_billable', true)->sum('minutes_worked');
            
            $months[] = [
                'year_month' => $yearMonth,
                'retainer_hours' => (float) $agreement->monthly_retainer_hours,
                'hours_worked' => $billableMinutes / 60,
                'entries_count' => $monthEntries->count(),
                'billable_minutes' => $billableMinutes,
            ];
        }

        // Calculate balances using RolloverCalculator
        $calculator = new RolloverCalculator();
        $balances = $calculator->calculateMultipleMonths(
            $months,
            (int) $agreement->rollover_months
        );

        // Merge balance data with month info
        $result = [];
        foreach ($balances as $index => $balance) {
            $monthData = $months[$index];
            $result[] = [
                'year_month' => $monthData['year_month'],
                'has_agreement' => true,
                'entries_count' => $monthData['entries_count'],
                'hours_worked' => round($monthData['hours_worked'], 2),
                'formatted_hours' => ClientTimeEntry::formatMinutesAsTime($monthData['billable_minutes']),
                'retainer_hours' => $monthData['retainer_hours'],
                'rollover_months' => $agreement->rollover_months,
                'opening' => [
                    'retainer_hours' => $balance['opening']['retainer_hours'],
                    'rollover_hours' => $balance['opening']['rollover_hours'],
                    'expired_hours' => $balance['opening']['expired_hours'],
                    'total_available' => $balance['opening']['total_available'],
                    'negative_offset' => $balance['opening']['negative_offset'],
                ],
                'closing' => [
                    'unused_hours' => $balance['closing']['unused_hours'],
                    'excess_hours' => $balance['closing']['excess_hours'],
                    'hours_used_from_retainer' => $balance['closing']['hours_used_from_retainer'],
                    'hours_used_from_rollover' => $balance['closing']['hours_used_from_rollover'],
                    'remaining_rollover' => $balance['closing']['remaining_rollover'],
                ],
            ];
        }

        // Return in descending order (most recent first)
        return array_reverse($result);
    }

    /**
     * Create a new time entry.
     */
    public function createTimeEntry(Request $request, $slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $validated = $request->validate([
            'project_id' => 'required|exists:client_projects,id',
            'task_id' => 'nullable|exists:client_tasks,id',
            'name' => 'nullable|string|max:255',
            'time' => 'required|string',
            'date_worked' => 'required|date',
            'user_id' => 'nullable|exists:users,id',
            'is_billable' => 'boolean',
            'job_type' => 'nullable|string|max:255',
        ]);
        
        // Verify project belongs to this company
        $project = ClientProject::where('id', $validated['project_id'])
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        // Parse time string to minutes
        $minutes = ClientTimeEntry::parseTimeToMinutes($validated['time']);
        
        if ($minutes <= 0) {
            return response()->json(['errors' => ['time' => ['Invalid time format. Use h:mm or decimal hours.']]], 422);
        }
        
        $entry = ClientTimeEntry::create([
            'project_id' => $project->id,
            'client_company_id' => $company->id,
            'task_id' => $validated['task_id'] ?? null,
            'name' => $validated['name'] ?? null,
            'minutes_worked' => $minutes,
            'date_worked' => $validated['date_worked'],
            'user_id' => $validated['user_id'] ?? Auth::id(),
            'creator_user_id' => Auth::id(),
            'is_billable' => $validated['is_billable'] ?? true,
            'job_type' => $validated['job_type'] ?? 'Software Development',
        ]);
        
        return response()->json($entry->load(['user:id,name,email', 'project:id,name,slug', 'task:id,name']), 201);
    }

    /**
     * Delete a time entry.
     */
    public function deleteTimeEntry($slug, $entryId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $entry = ClientTimeEntry::where('client_company_id', $company->id)->findOrFail($entryId);
        $entry->delete();
        
        return response()->json(['success' => true]);
    }
}
