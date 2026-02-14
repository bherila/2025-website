<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTask;
use App\Models\Files\FileForProject;
use Illuminate\Support\Facades\Gate;

class ClientPortalController extends Controller
{
    /**
     * Display the client portal for a company.
     */
    public function index($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $projects = ClientProject::where('client_company_id', $company->id)
            ->withCount(['tasks', 'timeEntries'])
            ->orderBy('name')
            ->get();

        $agreements = $company->agreements()
            ->where('is_visible_to_client', true)
            ->orderBy('active_date', 'desc')
            ->get();

        // Hydrate initial page data so the React index page doesn't need to call API on mount
        $users = $company->users()->orderBy('name')->get();

        $recentTimeEntries = $company->timeEntries()
            ->with(['user:id,name,email', 'project:id,name,slug', 'task:id,name', 'invoiceLine.invoice:client_invoice_id,invoice_number,issue_date'])
            ->orderBy('date_worked', 'desc')
            ->limit(5)
            ->get()
            ->map(function ($entry) {
                $ci = $entry->invoiceLine?->invoice;
                if ($ci) {
                    $entry->client_invoice = $ci;
                    $entry->client_invoice->invoice_date = $ci->issue_date ? $ci->issue_date->toDateString() : null;
                } else {
                    $entry->client_invoice = null;
                }
                return $entry;
            });

        // Hydrate company files for immediate listing (prevents initial loading spinner)
        $companyFiles = \App\Models\Files\FileForClientCompany::where('client_company_id', $company->id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return view('client-management.portal.index', [
            'company' => $company,
            'slug' => $slug,
            'projects' => $projects,
            'agreements' => $agreements,
            'companyUsers' => $users,
            'recentTimeEntries' => $recentTimeEntries,
            'companyFiles' => $companyFiles,
        ]);
    }

    /**
     * Display the time tracking page for a company.
     */
    public function time($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        // Provide company users and projects so the Time page can be server-hydrated
        $users = $company->users()->orderBy('name')->get();

        $projects = ClientProject::where('client_company_id', $company->id)
            ->withCount(['tasks', 'timeEntries'])
            ->orderBy('name')
            ->get();

        return view('client-management.portal.time', [
            'company' => $company,
            'slug' => $slug,
            'companyUsers' => $users,
            'projects' => $projects,
        ]);
    }

    /**
     * Display a specific project.
     */
    public function project($slug, $projectSlug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $project = ClientProject::where('slug', $projectSlug)
            ->where('client_company_id', $company->id)
            ->firstOrFail();

        // Hydrate tasks for the project (same shape as API)
        $tasks = ClientTask::where('project_id', $project->id)
            ->with(['assignee:id,name,email', 'creator:id,name'])
            ->orderByRaw('completed_at IS NOT NULL')
            ->orderBy('is_high_priority', 'desc')
            ->orderBy('created_at', 'desc')
            ->get();

        // Company users and projects (for Nav)
        $users = $company->users()->orderBy('name')->get();
        $projects = ClientProject::where('client_company_id', $company->id)
            ->withCount(['tasks', 'timeEntries'])
            ->orderBy('name')
            ->get();

        // Project files for immediate listing
        $projectFiles = FileForProject::where('project_id', $project->id)
            ->with('uploader:id,name')
            ->orderBy('created_at', 'desc')
            ->get();

        return view('client-management.portal.project', [
            'company' => $company,
            'project' => $project,
            'slug' => $slug,
            'tasks' => $tasks,
            'companyUsers' => $users,
            'projects' => $projects,
            'projectFiles' => $projectFiles,
        ]);
    }

    /**
     * Display the invoices list for a company.
     */
    public function invoices($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        // Hydrate invoices list for faster rendering
        $invoices = $company->invoices()
            ->orderBy('period_end', 'asc')
            ->get();

        return view('client-management.portal.invoices', [
            'company' => $company,
            'slug' => $slug,
            'invoices' => $invoices,
        ]);
    }

    /**
     * Display a specific invoice.
     */
    public function invoice($slug, $invoiceId)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('ClientCompanyMember', $company->id);

        $query = ClientInvoice::with(['agreement', 'lineItems.timeEntries', 'payments'])
            ->where('client_invoice_id', $invoiceId)
            ->where('client_company_id', $company->id);

        // Admins can see all invoices, but clients can only see issued or paid ones.
        if (! auth()->user()->hasRole('admin')) {
            $query->whereIn('status', ['issued', 'paid']);
        }

        $invoice = $query->firstOrFail();

        // Populate derived hourly summary values so the Blade hydration includes the same
        // breakdown the API returns (carried_in_hours / current_month_hours).
        $hoursBreakdown = $invoice->calculateHoursBreakdown();
        $invoice->carried_in_hours = $hoursBreakdown['carried_in_hours'];
        $invoice->current_month_hours = $hoursBreakdown['current_month_hours'];

        // Prepare a lightweight, null-stripped payload for the head JSON so we avoid
        // shipping explicit `null` values to the client (smaller payloads, undefined on client).
        $invoicePayload = $this->removeNullsRecursive($invoice->toArray());

        return view('client-management.portal.invoice', [
            'company' => $company,
            'invoice' => $invoicePayload,
            'slug' => $slug,
            'invoiceId' => $invoice->client_invoice_id,
        ]);
    }

    /**
     * Utility: recursively remove null values from arrays so Blade JSON can omit nulls.
     *
     * @param  mixed  $data
     * @return mixed
     */
    private function removeNullsRecursive($data)
    {
        if (is_array($data)) {
            foreach ($data as $k => $v) {
                $clean = $this->removeNullsRecursive($v);
                if ($clean === null) {
                    unset($data[$k]);
                } else {
                    $data[$k] = $clean;
                }
            }
            return $data;
        }

        return $data === null ? null : $data;
    }

    /**
     * Display the expenses page for a company (admin only).
     */
    public function expenses($slug)
    {
        $company = ClientCompany::where('slug', $slug)->firstOrFail();

        Gate::authorize('Admin');

        return view('client-management.portal.expenses', [
            'company' => $company,
            'slug' => $slug,
        ]);
    }
}
