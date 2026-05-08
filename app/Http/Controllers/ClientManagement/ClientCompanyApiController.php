<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
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
                'agreements' => function ($query): void {
                    $query
                        ->select(
                            'id',
                            'client_company_id',
                            'active_date',
                            'termination_date',
                            'monthly_retainer_hours',
                            'billing_cadence'
                        )
                        ->orderByDesc('active_date')
                        ->orderByDesc('id');
                },
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
        /** @var Collection<int, ClientAgreement> $agreements */
        $agreements = $company->getRelation('agreements');

        $unpaidInvoices = $invoices
            ->filter(fn (ClientInvoice $invoice): bool => $invoice->remaining_balance > 0)
            ->values();
        $currentAgreement = $agreements
            ->first(fn (ClientAgreement $agreement): bool => $agreement->isActive())
            ?? $agreements->first();
        $uninvoicedHours = round($this->numericCompanyAttribute($company, 'uninvoiced_minutes') / 60, 2);
        $retainerHours = $currentAgreement ? (float) $currentAgreement->monthly_retainer_hours : null;
        $cycleProgress = $retainerHours && $retainerHours > 0
            ? min(100.0, round(($uninvoicedHours / $retainerHours) * 100, 1))
            : null;

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
            'current_billing_cadence' => $currentAgreement?->effectiveBillingCadence()->value,
            'current_retainer_hours' => $retainerHours,
            'current_cycle_progress' => $cycleProgress,
            'needs_attention' => $unpaidInvoices->isNotEmpty() || $uninvoicedHours > ($retainerHours ?? 0),
            'total_balance_due' => round((float) $unpaidInvoices->sum(
                fn (ClientInvoice $invoice): float => $invoice->remaining_balance
            ), 2),
            'uninvoiced_hours' => $uninvoicedHours,
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

        $company = $this->findCompanyForDetail($id);

        return response()->json($this->serializeCompanyForDetail($company));
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

        if (array_key_exists('slug', $validatedData)) {
            $slugSource = $validatedData['slug'] ?: $validatedData['company_name'];
            $slug = ClientCompany::generateSlug($slugSource);
            if ($slug === '') {
                $slug = 'company-'.$company->id;
            }

            if (ClientCompany::where('slug', $slug)->where('id', '!=', $id)->exists()) {
                return response()->json([
                    'errors' => ['slug' => ['This slug is already in use by another company.']],
                ], 422);
            }
            $validatedData['slug'] = $slug;
        }

        $company->update($validatedData);
        $company->touchLastActivity();

        $company = $this->findCompanyForDetail($company->id);

        return response()->json([
            'success' => true,
            'message' => 'Company updated successfully',
            'company' => $this->serializeCompanyForDetail($company),
        ]);
    }

    private function findCompanyForDetail(int $id): ClientCompany
    {
        return ClientCompany::query()
            ->with([
                'users' => function ($query): void {
                    $query
                        ->select('users.id', 'users.name', 'users.email', 'users.user_role', 'users.last_login_date')
                        ->orderBy('users.name');
                },
                'agreements' => function ($query): void {
                    $query
                        ->orderByDesc('active_date')
                        ->orderByDesc('id');
                },
                'agreements.recurringItems',
                'activities' => function ($query): void {
                    $query
                        ->with('actor:id,name,email')
                        ->latest()
                        ->limit(100);
                },
            ])
            ->findOrFail($id);
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeCompanyForDetail(ClientCompany $company): array
    {
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
            'updated_at' => $this->serializeDateForJson($company->updated_at),
            'users' => $this->serializeUsersForIndex($company),
            'agreements' => $this->serializeAgreementsForDetail($company),
            'activities' => $this->serializeActivitiesForDetail($company),
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function serializeAgreementsForDetail(ClientCompany $company): array
    {
        /** @var Collection<int, ClientAgreement> $agreements */
        $agreements = $company->getRelation('agreements');

        return $agreements
            ->map(fn (ClientAgreement $agreement): array => [
                'id' => $agreement->id,
                'client_company_id' => $agreement->client_company_id,
                'active_date' => $this->serializeDateForJson($agreement->active_date),
                'termination_date' => $this->serializeDateForJson($agreement->termination_date),
                'agreement_text' => $agreement->agreement_text,
                'agreement_link' => $agreement->agreement_link,
                'client_company_signed_date' => $this->serializeDateForJson($agreement->client_company_signed_date),
                'client_company_signed_user_id' => $agreement->client_company_signed_user_id,
                'client_company_signed_name' => $agreement->client_company_signed_name,
                'client_company_signed_title' => $agreement->client_company_signed_title,
                'monthly_retainer_hours' => $agreement->monthly_retainer_hours,
                'catch_up_threshold_hours' => $agreement->catch_up_threshold_hours,
                'rollover_months' => $agreement->rollover_months,
                'hourly_rate' => $agreement->hourly_rate,
                'monthly_retainer_fee' => $agreement->monthly_retainer_fee,
                'is_visible_to_client' => (bool) $agreement->is_visible_to_client,
                'billing_cadence' => $agreement->effectiveBillingCadence()->value,
                'bill_overage_interim' => (bool) $agreement->bill_overage_interim,
                'first_cycle_proration' => $agreement->effectiveFirstCycleProration()->value,
                'initial_rollover_hours' => $agreement->initial_rollover_hours,
                'recurring_items' => $agreement->recurringItems->map(fn (ClientAgreementRecurringItem $item): array => [
                    'id' => $item->id,
                    'client_agreement_id' => $item->client_agreement_id,
                    'description' => $item->description,
                    'amount' => $item->amount,
                    'charge_cadence' => $item->charge_cadence->value,
                    'anchor_month' => $item->anchor_month,
                    'anchor_day' => $item->anchor_day,
                    'start_date' => $item->start_date->toDateString(),
                    'end_date' => $item->end_date?->toDateString(),
                    'is_taxable' => (bool) $item->is_taxable,
                    'is_summarized' => (bool) $item->is_summarized,
                    'notes' => $item->notes,
                ])->values()->toArray(),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function serializeActivitiesForDetail(ClientCompany $company): array
    {
        /** @var Collection<int, ClientCompanyActivity> $activities */
        $activities = $company->getRelation('activities');

        return $activities
            ->map(fn (ClientCompanyActivity $activity): array => [
                'id' => $activity->id,
                'client_company_id' => $activity->client_company_id,
                'actor_user_id' => $activity->actor_user_id,
                'actor_name' => $activity->actor?->name,
                'action' => $activity->action,
                'subject_type' => $activity->subject_type,
                'subject_id' => $activity->subject_id,
                'payload' => $activity->payload ?? [],
                'created_at' => $this->serializeDateForJson($activity->created_at),
            ])
            ->values()
            ->all();
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
