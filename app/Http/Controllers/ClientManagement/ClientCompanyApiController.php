<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ClientCompanyApiController extends Controller
{
    /**
     * Get all client companies with their users.
     */
    public function index()
    {
        Gate::authorize('Admin');

        $companies = ClientCompany::with(['users', 'invoices.payments', 'tasks'])->get()->map(function ($company) {
            $unpaidInvoices = $company->invoices
                ->whereNotIn('status', ['paid', 'void'])
                ->filter(function ($invoice) {
                    return $invoice->remaining_balance > 0;
                })
                ->values();

            $company->unpaid_invoices = $unpaidInvoices;
            $company->total_balance_due = $unpaidInvoices->sum('remaining_balance');

            $company->uninvoiced_hours = $company->timeEntries()
                ->where('is_billable', true)
                ->whereNull('client_invoice_line_id')
                ->sum('minutes_worked') / 60;

            // Calculate task totals
            $unbilledTasks = $company->tasks()
                ->where('milestone_price', '>', 0)
                ->whereNull('client_invoice_line_id')
                ->get();

            $company->uninvoiced_task_total = $unbilledTasks->sum('milestone_price');
            $company->uninvoiced_task_complete_total = $unbilledTasks
                ->whereNotNull('completed_at')
                ->sum('milestone_price');
            $company->uninvoiced_task_incomplete_total = $unbilledTasks
                ->whereNull('completed_at')
                ->sum('milestone_price');

            // Calculate lifetime value (sum of all paid invoices)
            $company->lifetime_value = $company->invoices
                ->where('status', 'paid')
                ->sum('invoice_total');

            return $company;
        });

        return response()->json($companies);
    }

    /**
     * Get a single client company by its ID.
     */
    public function show($id)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::with(['users', 'agreements'])->findOrFail($id);

        return response()->json($company);
    }

    /**
     * Update a client company.
     */
    public function update(Request $request, $id)
    {
        Gate::authorize('Admin');

        $validatedData = $request->validate([
            'company_name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'website' => 'nullable|url',
            'phone_number' => 'nullable|string|max:255',
            'default_hourly_rate' => 'nullable|numeric|min:0',
            'additional_notes' => 'nullable|string',
            'is_active' => 'required|boolean',
        ]);

        $company = ClientCompany::findOrFail($id);

        // Validate slug uniqueness if provided and different
        if (isset($validatedData['slug']) && $validatedData['slug'] !== $company->slug) {
            $slug = ClientCompany::generateSlug($validatedData['slug']);
            if (ClientCompany::where('slug', $slug)->where('id', '!=', $id)->exists()) {
                return response()->json([
                    'errors' => ['slug' => ['This slug is already in use by another company.']],
                ], 422);
            }
            $validatedData['slug'] = $slug;
        }

        $company->update($validatedData);
        $company->touchLastActivity();

        return response()->json([
            'success' => true,
            'message' => 'Company updated successfully',
            'company' => $company->fresh('users'),
        ]);
    }

    /**
     * Get all users for the invite modal.
     */
    public function getUsers()
    {
        Gate::authorize('Admin');

        $users = User::select('id', 'name', 'email', 'last_login_date')->orderBy('name')->get();

        return response()->json($users);
    }

    /**
     * Create a new user and assign them to a client company.
     */
    public function createUserAndAssign(Request $request)
    {
        Gate::authorize('Admin');

        $validatedData = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email',
            'client_company_id' => 'required|exists:client_companies,id',
        ]);

        try {
            DB::beginTransaction();

            // Create user with random password
            $user = User::create([
                'name' => $validatedData['name'],
                'email' => $validatedData['email'],
                'password' => Hash::make(Str::random(32)),
                'user_role' => null, // null role by default
            ]);

            // Assign to client company
            $company = ClientCompany::findOrFail($validatedData['client_company_id']);
            $company->users()->attach($user->id);
            $company->touchLastActivity();

            DB::commit();

            return response()->json([
                'success' => true,
                'message' => 'User created and assigned successfully',
                'user' => $user,
            ]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json([
                'success' => false,
                'error' => 'Failed to create user: '.$e->getMessage(),
            ], 500);
        }
    }
}
