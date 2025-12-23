<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\Project;
use App\Models\ClientManagement\Task;
use App\Models\ClientManagement\TimeEntry;
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
        
        $projects = Project::where('client_company_id', $company->id)
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
        
        $projectSlug = Project::generateSlug($validated['name']);
        
        // Ensure unique slug
        $baseSlug = $projectSlug;
        $counter = 1;
        while (Project::where('slug', $projectSlug)->exists()) {
            $projectSlug = $baseSlug . '-' . $counter;
            $counter++;
        }
        
        $project = Project::create([
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
        
        $project = Project::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $tasks = Task::where('project_id', $project->id)
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
        
        $project = Project::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'assignee_user_id' => 'nullable|exists:users,id',
            'is_high_priority' => 'boolean',
            'is_hidden_from_clients' => 'boolean',
        ]);
        
        $task = Task::create([
            'project_id' => $project->id,
            'name' => $validated['name'],
            'description' => $validated['description'] ?? null,
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
        
        $project = Project::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $task = Task::where('project_id', $project->id)->findOrFail($taskId);
        
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
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
        
        $project = Project::where('slug', $projectSlug)
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        $task = Task::where('project_id', $project->id)->findOrFail($taskId);
        $task->delete();
        
        return response()->json(['success' => true]);
    }

    /**
     * Get all time entries for a company (across all projects).
     */
    public function getTimeEntries($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        
        Gate::authorize('ClientCompanyMember', $company->id);
        
        $entries = TimeEntry::where('client_company_id', $company->id)
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
        
        return response()->json([
            'entries' => $entries,
            'total_time' => TimeEntry::formatMinutesAsTime($totalMinutes),
            'total_minutes' => $totalMinutes,
            'billable_time' => TimeEntry::formatMinutesAsTime($billableMinutes),
            'billable_minutes' => $billableMinutes,
        ]);
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
        $project = Project::where('id', $validated['project_id'])
                         ->where('client_company_id', $company->id)
                         ->firstOrFail();
        
        // Parse time string to minutes
        $minutes = TimeEntry::parseTimeToMinutes($validated['time']);
        
        if ($minutes <= 0) {
            return response()->json(['errors' => ['time' => ['Invalid time format. Use h:mm or decimal hours.']]], 422);
        }
        
        $entry = TimeEntry::create([
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
        
        $entry = TimeEntry::where('client_company_id', $company->id)->findOrFail($entryId);
        $entry->delete();
        
        return response()->json(['success' => true]);
    }
}
