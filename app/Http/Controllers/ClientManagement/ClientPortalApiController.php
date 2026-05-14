<?php

namespace App\Http\Controllers\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientTimeEntryService;
use App\Services\ClientManagement\DataTransferObjects\MonthSummary;
use App\Services\ClientManagement\RolloverCalculator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class ClientPortalApiController extends Controller
{
    public function __construct(private readonly ClientTimeEntryService $timeEntryService) {}

    /**
     * Get company data by slug.
     *
     * @return array<string, mixed>
     */
    public function getCompany(string $slug): array
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $companyData = $company->toArray();
        $companyUsers = $company->users;
        $adminUsers = User::where('user_role', 'Admin')->get();
        $companyData['users'] = $companyUsers->merge($adminUsers)->unique('id')->values();

        return $companyData;
    }

    /**
     * Get all companies the user has access to.
     */
    public function getAccessibleCompanies(): \Illuminate\Database\Eloquent\Collection
    {
        $user = Auth::user();
        if ($user->hasRole('admin')) {
            return ClientCompany::orderBy('company_name')->get(['id', 'company_name', 'slug']);
        }

        return $user->clientCompanies()
            ->orderBy('company_name')
            ->get(['id', 'company_name', 'slug']);
    }

    /**
     * Get all projects for a company.
     */
    public function getProjects(string $slug): \Illuminate\Database\Eloquent\Collection
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        return ClientProject::where('client_company_id', $company->id)
            ->withCount(['tasks', 'timeEntries'])
            ->orderBy('name')
            ->get();
    }

    /**
     * Create a new project.
     */
    public function createProject(Request $request, string $slug): JsonResponse
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
            $projectSlug = $baseSlug.'-'.$counter;
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
     * Update a project.
     */
    public function updateProject(Request $request, string $slug, string $projectSlug): JsonResponse
    {
        Gate::authorize('Admin');

        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $project = ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
        ]);

        if (isset($validated['name']) && $validated['name'] !== $project->name) {
            $newSlug = ClientProject::generateSlug($validated['name']);

            // Ensure unique slug within the company
            $baseSlug = $newSlug;
            $counter = 1;
            while (
                ClientProject::where('client_company_id', $company->id)
                    ->where('slug', $newSlug)
                    ->where('id', '!=', $project->id)
                    ->exists()
            ) {
                $newSlug = $baseSlug.'-'.$counter;
                $counter++;
            }
            $project->slug = $newSlug;
        }

        $project->update($validated);

        return response()->json($project);
    }

    /**
     * Get all tasks for a project.
     */
    public function getTasks(string $slug, string $projectSlug): \Illuminate\Database\Eloquent\Collection
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $project = ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        return ClientTask::where('project_id', $project->id)
            ->with(['assignee:id,name,email', 'creator:id,name'])
            ->orderByRaw('completed_at IS NOT NULL')
            ->orderBy('is_high_priority', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();
    }

    /**
     * Create a new task.
     */
    public function createTask(Request $request, string $slug, string $projectSlug): JsonResponse
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $project = ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $isAdmin = Gate::allows('Admin');

        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'due_date' => 'nullable|date',
            'assignee_user_id' => 'nullable|exists:users,id',
            'is_high_priority' => 'boolean',
            'is_hidden_from_clients' => 'boolean',
            'milestone_price' => 'nullable|numeric|min:0',
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
            'milestone_price' => $isAdmin ? round((float) ($validated['milestone_price'] ?? 0), 2) : 0.00,
        ]);

        return response()->json($task->load(['assignee:id,name,email', 'creator:id,name']), 201);
    }

    /**
     * Update a task.
     */
    public function updateTask(Request $request, string $slug, string $projectSlug, int $taskId): JsonResponse
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $project = ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        $task = ClientTask::where('project_id', $project->id)->findOrFail($taskId);

        $isAdmin = Gate::allows('Admin');

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'description' => 'nullable|string',
            'due_date' => 'nullable|date',
            'assignee_user_id' => 'nullable|exists:users,id',
            'is_high_priority' => 'boolean',
            'is_hidden_from_clients' => 'boolean',
            'completed' => 'boolean',
            'milestone_price' => 'nullable|numeric|min:0',
        ]);

        if (isset($validated['completed'])) {
            if ($validated['completed']) {
                $task->completed_at = now();
            } else {
                $task->completed_at = null;
            }
            unset($validated['completed']);
        }

        // Only admins can set milestone_price
        if ($isAdmin && array_key_exists('milestone_price', $validated)) {
            $validated['milestone_price'] = round((float) $validated['milestone_price'], 2);
        } else {
            unset($validated['milestone_price']);
        }

        $task->update($validated);

        return response()->json($task->fresh(['assignee:id,name,email', 'creator:id,name']));
    }

    /**
     * Delete a task.
     */
    public function deleteTask(string $slug, string $projectSlug, int $taskId): JsonResponse
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
     *
     * @return array<string, mixed>
     */
    public function getTimeEntries(string $slug): array
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();
        Gate::authorize('ClientCompanyMember', $company->id);

        $entries = ClientTimeEntry::where('client_company_id', $company->id)
            ->with(['user:id,name,email', 'project:id,name,slug', 'task:id,name', 'invoiceLine.invoice:client_invoice_id,invoice_number,status,issue_date'])
            ->orderBy('date_worked', 'desc')
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(function ($entry) {
                // Manually map the nested invoice relationship to the expected structure
                $ci = $entry->invoiceLine?->invoice;
                if ($ci) {
                    $entry->client_invoice = $ci;
                    $entry->client_invoice->invoice_date = $ci->issue_date ? $ci->issue_date->toDateString() : null;
                    // Include status so the frontend can distinguish draft vs issued
                    $entry->client_invoice->status = $ci->status;
                } else {
                    $entry->client_invoice = null;
                }

                return $entry;
            });

        // Calculate totals
        $totalMinutes = $entries->sum('minutes_worked');
        $billableMinutes = $entries->where('is_billable', true)->sum('minutes_worked');

        // Group entries by month and calculate rollover balances
        $monthlyData = $this->calculateMonthlyBalances($company, $entries);

        // Calculate total unbilled hours (billable hours in months without agreements)
        $totalUnbilledHours = 0;
        foreach ($monthlyData as $month) {
            if (! $month['has_agreement'] && isset($month['unbilled_hours'])) {
                // If the hours have already been applied to the next active agreement,
                // do not double-count them as still unbilled in the summary bar.
                if (! ($month['will_be_billed_in_next_agreement'] ?? false)) {
                    $totalUnbilledHours += $month['unbilled_hours'];
                }
            }
        }

        return [
            'entries' => $entries,
            'monthly_data' => $monthlyData,
            'total_time' => ClientTimeEntry::formatMinutesAsTime($totalMinutes),
            'total_minutes' => $totalMinutes,
            'billable_time' => ClientTimeEntry::formatMinutesAsTime($billableMinutes),
            'billable_minutes' => $billableMinutes,
            'total_unbilled_hours' => round($totalUnbilledHours, 2),
        ];
    }

    /**
     * Calculate monthly hour balances with rollover information.
     *
     * @param  Collection<int, ClientTimeEntry>  $entries
     * @return array<string, mixed>
     */
    protected function calculateMonthlyBalances(ClientCompany $company, Collection $entries): array
    {
        // Group entries by month
        $entriesByMonth = $entries->groupBy(function ($entry) {
            return $entry->date_worked->format('Y-m');
        });

        // Get the active agreement (or agreements over time)
        $agreement = $company->activeAgreement();

        if (! $agreement) {
            // No agreement - return month groupings with unbilled hours tracking
            return $entriesByMonth->map(function ($monthEntries, $yearMonth) {
                $billableMinutes = $monthEntries->where('is_billable', true)->sum('minutes_worked');
                $unbilledHours = round($billableMinutes / 60, 2);

                return [
                    'year_month' => $yearMonth,
                    'has_agreement' => false,
                    'entries_count' => $monthEntries->count(),
                    'hours_worked' => $unbilledHours,
                    'formatted_hours' => ClientTimeEntry::formatMinutesAsTime($billableMinutes),
                    'unbilled_hours' => $unbilledHours,
                    'opening' => null,
                    'closing' => null,
                ];
            })->values()->toArray();
        }

        // Build monthly hours data for calculator chronologically
        $monthKeys = $entriesByMonth->keys()->sort()->values();
        $months = [];

        $agreementStartMonth = $agreement->active_date?->format('Y-m');

        foreach ($monthKeys as $yearMonth) {
            $monthEntries = $entriesByMonth[$yearMonth];
            $billableMinutes = $monthEntries->where('is_billable', true)->sum('minutes_worked');
            $hoursWorked = $billableMinutes / 60;

            // If the month is before the agreement start, it has 0 retainer hours
            // but its hours will carry forward as a negative balance.
            $isPreAgreement = $agreementStartMonth && $yearMonth < $agreementStartMonth;

            $months[] = [
                'year_month' => $yearMonth,
                'retainer_hours' => $isPreAgreement ? 0.0 : (float) $agreement->monthly_retainer_hours,
                'hours_worked' => $hoursWorked,
                'entries_count' => $monthEntries->count(),
                'billable_minutes' => $billableMinutes,
                'is_pre_agreement' => $isPreAgreement,
            ];
        }

        // Calculate balances using RolloverCalculator
        $calculator = new RolloverCalculator;
        /** @var MonthSummary[] $balances */
        $balances = $calculator->calculateMultipleMonths(
            $months,
            (int) $agreement->rollover_months
        );

        // Merge balance data with month info
        // Also fetch invoice data to get catch-up hours and next-month starting balance
        // without duplicating billing logic — the invoicing service already computes these.
        $invoicesByWorkMonth = collect();
        if ($agreement->id) {
            $invoicesByWorkMonth = ClientInvoice::where('client_company_id', $company->id)
                ->where('client_agreement_id', $agreement->id)
                ->whereNotIn('status', ['void'])
                ->get()
                ->keyBy(function ($inv) {
                    // The invoice covers work done in the period_start month
                    return $inv->period_start->format('Y-m');
                });
        }

        $result = [];
        foreach ($balances as $index => $balance) {
            $monthData = $months[$index];
            $yearMonth = $monthData['year_month'];

            // Lookup the invoice that covers this work month
            $invoice = $invoicesByWorkMonth[$yearMonth] ?? null;

            $result[] = [
                'year_month' => $yearMonth,
                'has_agreement' => ! $monthData['is_pre_agreement'],
                'entries_count' => $monthData['entries_count'],
                'hours_worked' => round($monthData['hours_worked'], 2),
                'formatted_hours' => ClientTimeEntry::formatMinutesAsTime($monthData['billable_minutes']),
                'retainer_hours' => $monthData['retainer_hours'],
                'rollover_months' => $agreement->rollover_months,
                'opening' => [
                    'retainer_hours' => $balance->opening->retainerHours,
                    'rollover_hours' => $balance->opening->rolloverHours,
                    'expired_hours' => $balance->opening->expiredHours,
                    'total_available' => $balance->opening->totalAvailable,
                    'negative_offset' => $balance->opening->negativeOffset,
                    'invoiced_negative_balance' => $balance->opening->invoicedNegativeBalance,
                ],
                'closing' => [
                    'unused_hours' => $balance->closing->unusedHours,
                    'excess_hours' => $balance->closing->excessHours,
                    'hours_used_from_retainer' => $balance->closing->hoursUsedFromRetainer,
                    'hours_used_from_rollover' => $balance->closing->hoursUsedFromRollover,
                    'remaining_rollover' => $balance->closing->remainingRollover,
                    'negative_balance' => $balance->closing->negativeBalance,
                ],
                'unbilled_hours' => $monthData['is_pre_agreement'] ? $balance->closing->negativeBalance : 0,
                'will_be_billed_in_next_agreement' => $monthData['is_pre_agreement'],
                // Catch-up hours billed and next-month starting balance from invoice data
                'catch_up_hours_billed' => $invoice ? (float) $invoice->hours_billed_at_rate : 0,
                'next_month_starting_unused' => $invoice ? (float) $invoice->starting_unused_hours : null,
                'next_month_starting_negative' => $invoice ? (float) $invoice->starting_negative_hours : null,
            ];
        }

        // Return in descending order (most recent first)
        return array_reverse($result);
    }

    /**
     * Create a new time entry.
     */
    public function createTimeEntry(Request $request, string $slug): JsonResponse
    {
        return $this->storeOrUpdateTimeEntry($request, $slug);
    }

    /**
     * Update a time entry.
     */
    public function updateTimeEntry(Request $request, string $slug, int $entryId): JsonResponse
    {
        return $this->storeOrUpdateTimeEntry($request, $slug, $entryId);
    }

    /**
     * Shared logic for creating or updating a time entry.
     */
    private function storeOrUpdateTimeEntry(Request $request, string $slug, ?int $entryId = null): JsonResponse
    {
        Gate::authorize('Admin');

        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $isUpdate = $entryId !== null;

        $validated = $request->validate([
            'project_id' => ($isUpdate ? 'sometimes|' : '').'required|exists:client_projects,id',
            'task_id' => 'nullable|exists:client_tasks,id',
            'name' => 'nullable|string|max:255',
            'time' => ($isUpdate ? 'sometimes|' : '').'required|string',
            'date_worked' => ($isUpdate ? 'sometimes|' : '').'required|date',
            'user_id' => 'nullable|exists:users,id',
            'is_billable' => 'boolean',
            'is_deferred_billing' => 'boolean',
            'job_type' => 'nullable|string|max:255',
        ]);

        // Deferred billing only applies to billable entries — if billable is
        // being cleared, clear deferred too.
        if (array_key_exists('is_billable', $validated) && $validated['is_billable'] === false) {
            $validated['is_deferred_billing'] = false;
        }

        /** @var User $actor */
        $actor = Auth::user();

        try {
            $entry = $isUpdate
                ? $this->timeEntryService->update($company, (int) $entryId, $validated, $actor)
                : $this->timeEntryService->create($company, $validated, $actor);
        } catch (ClientManagementActionException $e) {
            if ($e->statusCode() === 422 && str_starts_with($e->getMessage(), 'Invalid time format')) {
                return response()->json(['errors' => ['time' => [$e->getMessage()]]], 422);
            }

            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json($entry, $isUpdate ? 200 : 201);
    }

    /**
     * Delete a time entry.
     */
    public function deleteTimeEntry(string $slug, int $entryId): JsonResponse
    {
        Gate::authorize('Admin');

        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        try {
            $this->timeEntryService->delete($company, $entryId);
        } catch (ClientManagementActionException $e) {
            return response()->json(['error' => $e->getMessage()], $e->statusCode());
        }

        return response()->json(['success' => true]);
    }
}
