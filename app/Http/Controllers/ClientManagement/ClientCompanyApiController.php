<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ClientCompanyApiController extends Controller
{
    /**
     * Get all client companies with their users.
     */
    public function index(): JsonResponse
    {
        Gate::authorize('Admin');

        $companies = ClientCompany::query()
            ->with([
                'users' => function ($query): void {
                    $query
                        ->select('users.id', 'users.name', 'users.email', 'users.user_role', 'users.last_login_date')
                        ->orderBy('users.name');
                },
                'invoices' => function ($query): void {
                    $query
                        ->select(
                            'client_invoice_id',
                            'client_company_id',
                            'invoice_number',
                            'invoice_total',
                            'issue_date',
                            'due_date',
                            'status'
                        )
                        ->whereNotIn('status', ['paid', 'void'])
                        ->with([
                            'payments' => function ($query): void {
                                $query->select('client_invoice_payment_id', 'client_invoice_id', 'amount');
                            },
                        ])
                        ->orderBy('due_date')
                        ->orderBy('client_invoice_id');
                },
            ])
            ->withSum([
                'timeEntries as uninvoiced_minutes' => function ($query): void {
                    $query
                        ->where('is_billable', true)
                        ->whereNull('client_invoice_line_id');
                },
            ], 'minutes_worked')
            ->withSum([
                'tasks as uninvoiced_task_total' => function ($query): void {
                    $query
                        ->where('milestone_price', '>', 0)
                        ->whereNull('client_invoice_line_id');
                },
            ], 'milestone_price')
            ->withSum([
                'tasks as uninvoiced_task_complete_total' => function ($query): void {
                    $query
                        ->where('milestone_price', '>', 0)
                        ->whereNull('client_invoice_line_id')
                        ->whereNotNull('completed_at');
                },
            ], 'milestone_price')
            ->withSum([
                'tasks as uninvoiced_task_incomplete_total' => function ($query): void {
                    $query
                        ->where('milestone_price', '>', 0)
                        ->whereNull('client_invoice_line_id')
                        ->whereNull('completed_at');
                },
            ], 'milestone_price')
            ->withSum([
                'invoices as lifetime_value' => function ($query): void {
                    $query->where('status', 'paid');
                },
            ], 'invoice_total')
            ->orderByDesc('is_active')
            ->orderBy('company_name')
            ->get()
            ->map(fn (ClientCompany $company): array => $this->serializeCompanyForIndex($company))
            ->values();

        return response()->json($companies);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeCompanyForIndex(ClientCompany $company): array
    {
        /** @var Collection<int, ClientInvoice> $invoices */
        $invoices = $company->getRelation('invoices');

        $unpaidInvoices = $invoices
            ->filter(fn (ClientInvoice $invoice): bool => $invoice->remaining_balance > 0)
            ->values();

        return [
            'id' => $company->id,
            'company_name' => $company->company_name,
            'slug' => $company->slug,
            'address' => $company->address,
            'website' => $company->website,
            'phone_number' => $company->phone_number,
            'default_hourly_rate' => $company->default_hourly_rate,
            'additional_notes' => $company->additional_notes,
            'is_active' => (bool) $company->is_active,
            'last_activity' => $this->serializeDateForJson($company->last_activity),
            'created_at' => $this->serializeDateForJson($company->created_at),
            'users' => $this->serializeUsersForIndex($company),
            'agreements' => [],
            'total_balance_due' => round((float) $unpaidInvoices->sum(
                fn (ClientInvoice $invoice): float => $invoice->remaining_balance
            ), 2),
            'uninvoiced_hours' => round($this->numericCompanyAttribute($company, 'uninvoiced_minutes') / 60, 2),
            'uninvoiced_task_total' => round($this->numericCompanyAttribute($company, 'uninvoiced_task_total'), 2),
            'uninvoiced_task_complete_total' => round($this->numericCompanyAttribute($company, 'uninvoiced_task_complete_total'), 2),
            'uninvoiced_task_incomplete_total' => round($this->numericCompanyAttribute($company, 'uninvoiced_task_incomplete_total'), 2),
            'lifetime_value' => round($this->numericCompanyAttribute($company, 'lifetime_value'), 2),
            'unpaid_invoices' => $unpaidInvoices
                ->map(fn (ClientInvoice $invoice): array => $this->serializeUnpaidInvoiceForIndex($invoice))
                ->all(),
        ];
    }

    /**
     * @return array<int, array{id: int, name: string, email: string, user_role: string, last_login_date: string|null}>
     */
    private function serializeUsersForIndex(ClientCompany $company): array
    {
        /** @var Collection<int, User> $users */
        $users = $company->getRelation('users');

        return $users
            ->map(fn (User $user): array => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'user_role' => $user->user_role,
                'last_login_date' => $this->serializeDateForJson($user->last_login_date),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeUnpaidInvoiceForIndex(ClientInvoice $invoice): array
    {
        return [
            'client_invoice_id' => $invoice->client_invoice_id,
            'invoice_number' => $invoice->invoice_number,
            'invoice_total' => round((float) $invoice->invoice_total, 2),
            'issue_date' => $this->serializeDateForJson($invoice->issue_date),
            'due_date' => $this->serializeDateForJson($invoice->due_date),
            'status' => $invoice->status,
            'remaining_balance' => round($invoice->remaining_balance, 2),
        ];
    }

    private function numericCompanyAttribute(ClientCompany $company, string $attribute): float
    {
        return (float) ($company->getAttribute($attribute) ?? 0);
    }

    private function serializeDateForJson(mixed $value): ?string
    {
        if ($value instanceof DateTimeInterface) {
            return $value->format('Y-m-d H:i:s');
        }

        if (is_string($value) && $value !== '') {
            return $value;
        }

        return null;
    }

    /**
     * Get a single client company by its ID.
     */
    public function show(int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $company = ClientCompany::with(['users', 'agreements'])->findOrFail($id);

        return response()->json($company);
    }

    /**
     * Update a client company.
     */
    public function update(Request $request, int $id): JsonResponse
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
    public function getUsers(): JsonResponse
    {
        Gate::authorize('Admin');

        $users = User::select('id', 'name', 'email', 'last_login_date')->orderBy('name')->get();

        return response()->json($users);
    }

    /**
     * Create a new user and assign them to a client company.
     */
    public function createUserAndAssign(Request $request): JsonResponse
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
