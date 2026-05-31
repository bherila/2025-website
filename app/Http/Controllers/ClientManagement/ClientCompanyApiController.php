<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\UpdateClientCompanyRequest;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientAgreementRecurringItem;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Database\Eloquent\Builder;
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
    public function index(Request $request): JsonResponse
    {
        Gate::authorize('Admin');

        $status = $this->resolveStatusFilter($request->string('status')->toString());
        $sort = $request->string('sort')->toString() ?: 'name';
        $search = trim($request->string('search')->toString());
        $needsAttentionOnly = $request->boolean('needs_attention');
        $stripeDisabledOnly = $request->boolean('stripe_disabled');
        $perPage = min(50, max(1, $request->integer('per_page', 25)));

        // The needs-attention rule depends on periodRetainerHours()/cadence,
        // which is not pure SQL, so resolve the (active) attention set once in
        // PHP and reuse it for the KPI stat, the filter, and the per-card flag.
        $attentionIds = $this->needsAttentionCompanyIds();

        $query = ClientCompany::query()
            ->with([
                'agreements' => function ($query): void {
                    $query
                        ->select(
                            'id',
                            'client_company_id',
                            'active_date',
                            'termination_date',
                            'monthly_retainer_hours',
                            'retainer_hours',
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
                        ->unpaid()
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
            ], 'invoice_total');

        $this->applyStatusFilter($query, $status);

        if ($search !== '') {
            $query->where(function (Builder $builder) use ($search): void {
                $builder
                    ->where('company_name', 'like', '%'.$search.'%')
                    ->orWhere('slug', 'like', '%'.$search.'%');
            });
        }

        if ($needsAttentionOnly) {
            $query->whereIn('id', $attentionIds !== [] ? $attentionIds : [0]);
        }

        if ($stripeDisabledOnly) {
            $query->where('stripe_billing_enabled', false);
        }

        $this->applySort($query, $sort, $status, $attentionIds);

        $paginator = $query->paginate($perPage);

        $companies = collect($paginator->items())
            ->map(fn (ClientCompany $company): array => $this->serializeCompanyForIndex(
                $company,
                in_array((int) $company->id, $attentionIds, true)
            ))
            ->values()
            ->all();

        return response()->json([
            'data' => $companies,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
                'has_more' => $paginator->hasMorePages(),
                'sort' => $sort,
                'status' => $status,
                'search' => $search,
                'needs_attention' => $needsAttentionOnly,
                'stripe_disabled' => $stripeDisabledOnly,
            ],
            'stats' => $this->companyStats($attentionIds),
        ]);
    }

    private function resolveStatusFilter(string $status): string
    {
        return in_array($status, ['active', 'inactive', 'all'], true) ? $status : 'active';
    }

    /**
     * @param  Builder<ClientCompany>  $query
     */
    private function applyStatusFilter(Builder $query, string $status): void
    {
        if ($status === 'active') {
            $query->where('is_active', true);
        } elseif ($status === 'inactive') {
            $query->where('is_active', false);
        }
    }

    /**
     * @param  Builder<ClientCompany>  $query
     * @param  list<int>  $attentionIds
     */
    private function applySort(Builder $query, string $sort, string $status, array $attentionIds): void
    {
        switch ($sort) {
            case 'balance_due':
                $query
                    ->addSelect(['balance_due_sort' => ClientInvoice::companyOpenBalanceSubquery()])
                    ->orderByDesc('balance_due_sort')
                    ->orderBy('company_name');

                break;
            case 'last_activity':
                $query
                    ->orderByRaw('last_activity is null')
                    ->orderByDesc('last_activity')
                    ->orderBy('company_name');

                break;
            case 'needs_attention':
                if ($attentionIds !== []) {
                    $query->orderByRaw('CASE WHEN id IN ('.implode(',', $attentionIds).') THEN 0 ELSE 1 END');
                }
                $query->orderBy('company_name');

                break;
            default:
                if ($status === 'all') {
                    $query->orderByDesc('is_active');
                }
                $query->orderBy('company_name');

                break;
        }
    }

    /**
     * IDs of active companies that currently need attention (unpaid balance, or
     * uninvoiced hours beyond the period retainer). Computed in PHP over a lean
     * projection so it stays identical to the per-card flag and the KPI stat.
     *
     * @return list<int>
     */
    private function needsAttentionCompanyIds(): array
    {
        return ClientCompany::query()
            ->select('client_companies.id')
            ->where('is_active', true)
            ->with(['agreements' => function ($query): void {
                $query
                    ->select('id', 'client_company_id', 'active_date', 'termination_date', 'monthly_retainer_hours', 'retainer_hours', 'billing_cadence')
                    ->orderByDesc('active_date')
                    ->orderByDesc('id');
            }])
            ->withSum([
                'timeEntries as uninvoiced_minutes' => function ($query): void {
                    $query
                        ->where('is_billable', true)
                        ->whereNull('client_invoice_line_id');
                },
            ], 'minutes_worked')
            ->addSelect(['open_balance' => ClientInvoice::companyOpenBalanceSubquery()])
            ->get()
            ->filter(fn (ClientCompany $company): bool => $this->companyNeedsAttention($company))
            ->map(fn (ClientCompany $company): int => (int) $company->id)
            ->values()
            ->all();
    }

    private function companyNeedsAttention(ClientCompany $company): bool
    {
        if ($this->numericCompanyAttribute($company, 'open_balance') > 0) {
            return true;
        }

        $uninvoicedHours = round($this->numericCompanyAttribute($company, 'uninvoiced_minutes') / 60, 2);
        $currentAgreement = $this->currentAgreement($company->getRelation('agreements'));
        $periodRetainerHours = $currentAgreement?->periodRetainerHours();

        return $uninvoicedHours > ($periodRetainerHours ?? 0.0);
    }

    /**
     * Global KPI tile figures, independent of pagination/search/filter.
     *
     * @param  list<int>  $attentionIds
     * @return array{active_clients: int, inactive_clients: int, open_balance: float, needs_attention: int, stripe_disabled: int}
     */
    private function companyStats(array $attentionIds): array
    {
        $activeClients = ClientCompany::query()->where('is_active', true)->count();
        $inactiveClients = ClientCompany::query()->where('is_active', false)->count();
        $stripeDisabled = ClientCompany::query()
            ->where('is_active', true)
            ->where('stripe_billing_enabled', false)
            ->count();

        $openBalance = (float) DB::table('client_invoices as ci')
            ->join('client_companies as c', 'c.id', '=', 'ci.client_company_id')
            ->where('c.is_active', true)
            ->whereNull('c.deleted_at')
            ->whereNull('ci.deleted_at')
            ->whereNotIn('ci.status', ClientInvoice::SETTLED_STATUSES)
            ->selectRaw('COALESCE(SUM('.ClientInvoice::clampedRemainingSql('ci').'), 0) as total')
            ->value('total');

        return [
            'active_clients' => $activeClients,
            'inactive_clients' => $inactiveClients,
            'open_balance' => round($openBalance, 2),
            'needs_attention' => count($attentionIds),
            'stripe_disabled' => $stripeDisabled,
        ];
    }

    /**
     * Resolve the agreement that currently governs billing: the active one if
     * present, otherwise the most recent.
     *
     * @param  Collection<int, ClientAgreement>  $agreements
     */
    private function currentAgreement(Collection $agreements): ?ClientAgreement
    {
        return $agreements->first(fn (ClientAgreement $agreement): bool => $agreement->isActive())
            ?? $agreements->first();
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeCompanyForIndex(ClientCompany $company, bool $needsAttention): array
    {
        /** @var Collection<int, ClientInvoice> $invoices */
        $invoices = $company->getRelation('invoices');
        /** @var Collection<int, ClientAgreement> $agreements */
        $agreements = $company->getRelation('agreements');

        $unpaidInvoices = $invoices
            ->filter(fn (ClientInvoice $invoice): bool => $invoice->remaining_balance > 0)
            ->values();
        $currentAgreement = $this->currentAgreement($agreements);
        $uninvoicedHours = round($this->numericCompanyAttribute($company, 'uninvoiced_minutes') / 60, 2);
        $periodRetainerHours = $currentAgreement?->periodRetainerHours();
        $cycleProgress = $periodRetainerHours !== null && $periodRetainerHours > 0
            ? min(100.0, round(($uninvoicedHours / $periodRetainerHours) * 100, 1))
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
            'stripe_billing_enabled' => (bool) $company->stripe_billing_enabled,
            'last_activity' => $this->serializeDateForJson($company->last_activity),
            'created_at' => $this->serializeDateForJson($company->created_at),
            'users' => $this->serializeUsersForIndex($company),
            'agreements' => [],
            'current_billing_cadence' => $currentAgreement?->effectiveBillingCadence()->value,
            'current_retainer_hours' => $periodRetainerHours,
            'current_cycle_progress' => $cycleProgress,
            'needs_attention' => $needsAttention,
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
    public function update(UpdateClientCompanyRequest $request, int $id): JsonResponse
    {
        Gate::authorize('Admin');

        $validatedData = $request->validated();

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
            'stripe_billing_enabled' => (bool) $company->stripe_billing_enabled,
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
     * Lightweight company list for selects (e.g. the invite-people modal),
     * independent of the paginated index payload.
     */
    public function options(): JsonResponse
    {
        Gate::authorize('Admin');

        $companies = ClientCompany::query()
            ->orderByDesc('is_active')
            ->orderBy('company_name')
            ->get(['id', 'company_name', 'slug']);

        return response()->json($companies);
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
