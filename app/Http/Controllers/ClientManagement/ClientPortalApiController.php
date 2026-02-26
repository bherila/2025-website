<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use App\Services\ClientManagement\ClientInvoicingService;
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
    public function getAccessibleCompanies()
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
    public function getProjects($slug)
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
     * Update a project.
     */
    public function updateProject(Request $request, $slug, $projectSlug)
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
                $newSlug = $baseSlug . '-' . $counter;
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
    public function getTasks($slug, $projectSlug)
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
            if (!$month['has_agreement'] && isset($month['unbilled_hours'])) {
                // If the hours have already been applied to the next active agreement,
                // do not double-count them as still unbilled in the summary bar.
                if (!($month['will_be_billed_in_next_agreement'] ?? false)) {
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
        /** @var \App\Services\ClientManagement\DataTransferObjects\MonthSummary[] $balances */
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
                'has_agreement' => !$monthData['is_pre_agreement'],
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
        return $this->storeOrUpdateTimeEntry($request, $slug);
    }

    /**
     * Update a time entry.
     */
    public function updateTimeEntry(Request $request, $slug, $entryId)
    {
        return $this->storeOrUpdateTimeEntry($request, $slug, $entryId);
    }

    /**
     * Shared logic for creating or updating a time entry.
     */
    private function storeOrUpdateTimeEntry(Request $request, string $slug, ?int $entryId = null)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $isUpdate = $entryId !== null;

        $validated = $request->validate([
            'project_id' => ($isUpdate ? 'sometimes|' : '') . 'required|exists:client_projects,id',
            'task_id' => 'nullable|exists:client_tasks,id',
            'name' => 'nullable|string|max:255',
            'time' => ($isUpdate ? 'sometimes|' : '') . 'required|string',
            'date_worked' => ($isUpdate ? 'sometimes|' : '') . 'required|date',
            'user_id' => 'nullable|exists:users,id',
            'is_billable' => 'boolean',
            'job_type' => 'nullable|string|max:255',
        ]);

        if (isset($validated['project_id'])) {
            // Verify project belongs to this company
            ClientProject::where('id', $validated['project_id'])
                ->where('client_company_id', $company->id)
                ->firstOrFail();
        }

        if (isset($validated['time'])) {
            // Parse time string to minutes
            $minutes = ClientTimeEntry::parseTimeToMinutes($validated['time']);

            if ($minutes <= 0) {
                return response()->json(['errors' => ['time' => ['Invalid time format. Use h:mm or decimal hours.']]], 422);
            }
            $validated['minutes_worked'] = $minutes;
            unset($validated['time']);
        }

        // Check if date_worked falls within an issued invoice period
        $dateWorked = $validated['date_worked'] ?? null;
        if ($dateWorked) {
            $issuedInvoice = ClientInvoice::where('client_company_id', $company->id)
                ->whereIn('status', ['issued', 'paid'])
                ->where('period_start', '<=', $dateWorked)
                ->where('period_end', '>=', $dateWorked)
                ->first();

            if ($issuedInvoice) {
                return response()->json([
                    'error' => 'Cannot add time entries to periods covered by issued invoices. The period ' .
                        $issuedInvoice->period_start->format('M j, Y') . ' - ' .
                        $issuedInvoice->period_end->format('M j, Y') .
                        ' is already invoiced.'
                ], 403);
            }
        }

        if ($isUpdate) {
            $entry = ClientTimeEntry::where('client_company_id', $company->id)->findOrFail($entryId);
            // Block edits to entries on issued/paid invoices
            if ($entry->isOnIssuedInvoice()) {
                return response()->json(['error' => 'Cannot update time entries on issued invoices.'], 403);
            }
            // If on a draft invoice, unlink so regeneration can re-assign it
            if ($entry->isLinkedToInvoice()) {
                $entry->update(['client_invoice_line_id' => null]);
            }
            $entry->update($validated);
        } else {
            $entry = ClientTimeEntry::create([
                'project_id' => $validated['project_id'],
                'client_company_id' => $company->id,
                'task_id' => $validated['task_id'] ?? null,
                'name' => $validated['name'] ?? null,
                'minutes_worked' => $validated['minutes_worked'],
                'date_worked' => $validated['date_worked'],
                'user_id' => $validated['user_id'] ?? Auth::id(),
                'creator_user_id' => Auth::id(),
                'is_billable' => $validated['is_billable'] ?? true,
                'job_type' => $validated['job_type'] ?? 'Software Development',
            ]);
        }

        // Regenerate draft invoices that cover the affected period
        $this->regenerateDraftInvoicesForDate($company, $entry->date_worked);

        return response()->json(
            $entry->load(['user:id,name,email', 'project:id,name,slug', 'task:id,name']),
            $isUpdate ? 200 : 201
        );
    }

    /**
     * Delete a time entry.
     */
    public function deleteTimeEntry($slug, $entryId)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $entry = ClientTimeEntry::where('client_company_id', $company->id)->findOrFail($entryId);
        // Block deletion of entries on issued/paid invoices
        if ($entry->isOnIssuedInvoice()) {
            return response()->json(['error' => 'Cannot delete time entries on issued invoices.'], 403);
        }
        // If on a draft invoice, unlink first
        if ($entry->isLinkedToInvoice()) {
            $entry->update(['client_invoice_line_id' => null]);
        }
        $dateWorked = $entry->date_worked;
        $entry->delete();

        // Regenerate draft invoices that cover the affected period
        $this->regenerateDraftInvoicesForDate($company, $dateWorked);

        return response()->json(['success' => true]);
    }

    /**
     * Regenerate any draft invoices whose period covers the given date.
     *
     * This ensures that when time entries are created, updated, or deleted,
     * any existing draft (upcoming) invoices are refreshed to reflect the changes.
     */
    protected function regenerateDraftInvoicesForDate(ClientCompany $company, $date): void
    {
        $dateStr = $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : (string) $date;

        $draftInvoices = ClientInvoice::where('client_company_id', $company->id)
            ->where('status', 'draft')
            ->where('period_start', '<=', $dateStr)
            ->where('period_end', '>=', $dateStr)
            ->get();

        if ($draftInvoices->isEmpty()) {
            return;
        }

        $invoicingService = app(ClientInvoicingService::class);

        foreach ($draftInvoices as $invoice) {
            try {
                $invoicingService->generateInvoice(
                    $company,
                    $invoice->period_start,
                    $invoice->period_end
                );
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning('Failed to regenerate draft invoice on time entry change', [
                    'invoice_id' => $invoice->client_invoice_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
