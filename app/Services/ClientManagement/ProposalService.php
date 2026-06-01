<?php

namespace App\Services\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use App\Enums\ClientManagement\ChargeCadence;
use App\Enums\ClientManagement\FirstCycleProration;
use App\Enums\ClientManagement\InvoiceKind;
use App\Enums\ClientManagement\InvoiceLineType;
use App\Enums\ClientManagement\ProposalItemKind;
use App\Enums\ClientManagement\ProposalStatus;
use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Mail\ProposalActionMail;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyActivity;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientProposal;
use App\Models\ClientManagement\ClientTask;
use App\Models\User;
use App\Services\Finance\MoneyMath;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Authoring, versioning, and client-action handling for client proposals.
 *
 * On acceptance a proposal materializes a signed {@see ClientAgreement}, a
 * draft ad-hoc upfront invoice, a project, and tasks — reusing the existing
 * agreement/invoicing framework. All money math goes through {@see MoneyMath}.
 */
class ProposalService
{
    /**
     * Create a blank draft proposal for a company (admin authoring entrypoint).
     */
    public function createBlank(ClientCompany $company): ClientProposal
    {
        return ClientProposal::create([
            'client_company_id' => $company->id,
            'status' => ProposalStatus::Draft,
            'version' => 1,
            'title' => 'Untitled Proposal',
            'base_amount' => 0,
            'payment_net_days' => 30,
        ]);
    }

    /**
     * Update a draft proposal's fields and (optionally) sync its items.
     *
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>|null  $items
     */
    public function update(ClientProposal $proposal, array $attributes, ?array $items = null): ClientProposal
    {
        if (! $proposal->isEditable()) {
            throw new ClientManagementActionException('Only draft proposals can be edited.', 422);
        }

        DB::transaction(function () use ($proposal, $attributes, $items): void {
            if ($attributes !== []) {
                $proposal->update($attributes);
            }

            if ($items !== null) {
                $this->syncItems($proposal, $items);
            }
        });

        return $proposal->fresh('items');
    }

    /**
     * Send a draft proposal to the client (makes it visible and pending).
     */
    public function send(ClientProposal $proposal, User $user): ClientProposal
    {
        if (! $proposal->isEditable()) {
            throw new ClientManagementActionException('Only draft proposals can be sent.', 422);
        }

        DB::transaction(function () use ($proposal, $user): void {
            $proposal->update([
                'status' => ProposalStatus::Sent,
                'is_visible_to_client' => true,
                'sent_at' => now(),
            ]);

            // Only the newly-sent version of a chain stays client-visible so the
            // portal never surfaces (or lets the client act on) a superseded one.
            ClientProposal::query()
                ->where('root_id', $proposal->root_id ?? $proposal->id)
                ->whereKeyNot($proposal->id)
                ->update(['is_visible_to_client' => false]);

            ClientCompanyActivity::record($proposal->clientCompany, 'proposal.sent', $proposal, [
                'version' => $proposal->version,
            ], $user->id);
            $proposal->clientCompany->touchLastActivity();
        });

        $this->notifyAdmin($proposal->fresh(['clientCompany', 'items']), 'sent');

        return $proposal->fresh('items');
    }

    /**
     * Create a new draft revision from an existing version, copying content and items.
     */
    public function createRevision(ClientProposal $from, User $user): ClientProposal
    {
        return DB::transaction(function () use ($from, $user): ClientProposal {
            $from->loadMissing('items');
            $rootId = $from->root_id ?? $from->id;
            $nextVersion = (int) ClientProposal::where('root_id', $rootId)->max('version') + 1;

            $revision = ClientProposal::create([
                'client_company_id' => $from->client_company_id,
                'root_id' => $rootId,
                'version' => $nextVersion,
                'previous_version_id' => $from->id,
                'project_id' => $from->project_id,
                'status' => ProposalStatus::Draft,
                'title' => $from->title,
                'body_markdown' => $from->body_markdown,
                'base_amount' => $from->base_amount,
                'base_description' => $from->base_description,
                'credit_amount' => $from->credit_amount,
                'credit_label' => $from->credit_label,
                'payment_net_days' => $from->payment_net_days,
                'estimated_completion_days' => $from->estimated_completion_days,
                'retainer_amount' => $from->retainer_amount,
                'retainer_interval_months' => $from->retainer_interval_months,
                'retainer_included_hours' => $from->retainer_included_hours,
                'retainer_hourly_rate' => $from->retainer_hourly_rate,
                'retainer_description' => $from->retainer_description,
            ]);

            foreach ($from->items as $item) {
                $revision->items()->create([
                    'kind' => $item->kind->value,
                    'description' => $item->description,
                    'amount' => $item->amount,
                    'charge_cadence' => $item->charge_cadence->value,
                    'is_optional' => $item->is_optional,
                    'is_selected' => false,
                    'sort_order' => $item->sort_order,
                ]);
            }

            ClientCompanyActivity::record($from->clientCompany, 'proposal.revised', $revision, [
                'from_version' => $from->version,
                'version' => $nextVersion,
            ], $user->id);

            return $revision->fresh('items');
        });
    }

    /**
     * Accept a proposal: materialize a signed agreement, a draft upfront
     * invoice, a project, and tasks. Acceptance is the binding signature.
     *
     * @param  array<int, int>  $selectedItemIds  Ids of optional items the client opted into.
     * @return array{agreement: ClientAgreement, invoice: ClientInvoice, project: ClientProject, tasks: array<int, ClientTask>}
     */
    public function accept(ClientProposal $proposal, User $user, array $selectedItemIds, string $name, string $title): array
    {
        if (! $proposal->isPending()) {
            throw new ClientManagementActionException('This proposal is not awaiting a decision.', 422);
        }

        $result = DB::transaction(function () use ($proposal, $user, $selectedItemIds, $name, $title): array {
            // Re-read under a row lock and re-check before materializing side effects,
            // so two overlapping accepts (double-click, retry, two tabs) cannot each
            // create their own agreement/invoice/project/tasks.
            $proposal = ClientProposal::query()->lockForUpdate()->findOrFail($proposal->id);

            if (! $proposal->isPending()) {
                throw new ClientManagementActionException('This proposal is not awaiting a decision.', 422);
            }

            $company = $proposal->clientCompany;
            $proposal->loadMissing('items');

            // 1. Resolve selection: mandatory items always; optional items only when chosen.
            foreach ($proposal->items as $item) {
                $selected = $item->is_optional ? in_array($item->id, $selectedItemIds, true) : true;
                if ((bool) $item->is_selected !== $selected) {
                    $item->update(['is_selected' => $selected]);
                }
            }
            $proposal->load('items');

            // 2. Anchors.
            $acceptedAt = now();
            $activeDate = $acceptedAt->copy()->addMonth()->startOfMonth();
            $dueDate = $acceptedAt->copy()->addDays((int) $proposal->payment_net_days);

            // 3. Materialize the signed agreement (acceptance is the signature).
            $agreement = ClientAgreement::create(array_merge([
                'source_proposal_id' => $proposal->id,
                'client_company_id' => $company->id,
                'active_date' => $activeDate,
                'termination_date' => null,
                'agreement_text' => $proposal->body_markdown,
                'is_visible_to_client' => true,
                'rollover_months' => 0,
                'bill_overage_interim' => false,
                'first_cycle_proration' => FirstCycleProration::FullPeriod->value,
            ], $this->retainerAgreementAttributes($proposal)));

            $agreement->sign($user, $name, $title);

            // 4. Draft ad-hoc upfront invoice: base + selected one-time add-ons - credit.
            $invoice = ClientInvoice::create([
                'client_company_id' => $company->id,
                'client_agreement_id' => $agreement->id,
                'period_start' => $acceptedAt->toDateString(),
                'period_end' => $acceptedAt->toDateString(),
                'invoice_number' => $this->generateInvoiceNumber($company, $acceptedAt),
                'invoice_total' => 0,
                'due_date' => $dueDate,
                'status' => 'draft',
                'invoice_kind' => InvoiceKind::AdHoc->value,
            ]);

            $sortOrder = 0;

            $baseAmount = MoneyMath::round((string) $proposal->base_amount);
            ClientInvoiceLine::create([
                'client_invoice_id' => $invoice->client_invoice_id,
                'client_agreement_id' => $agreement->id,
                'description' => $proposal->base_description ?: 'Base fee',
                'quantity' => '1',
                'unit_price' => $baseAmount,
                'line_total' => $baseAmount,
                'line_type' => InvoiceLineType::Adjustment->value,
                'line_date' => $acceptedAt->toDateString(),
                'sort_order' => $sortOrder++,
            ]);

            foreach ($proposal->items as $item) {
                if ($item->kind === ProposalItemKind::AddOn
                    && $item->charge_cadence === ChargeCadence::OneTime
                    && $item->is_selected) {
                    $amount = MoneyMath::round((string) $item->amount);
                    ClientInvoiceLine::create([
                        'client_invoice_id' => $invoice->client_invoice_id,
                        'client_agreement_id' => $agreement->id,
                        'description' => $item->description,
                        'quantity' => '1',
                        'unit_price' => $amount,
                        'line_total' => $amount,
                        'line_type' => InvoiceLineType::Adjustment->value,
                        'line_date' => $acceptedAt->toDateString(),
                        'sort_order' => $sortOrder++,
                    ]);
                }
            }

            if ($proposal->credit_amount !== null && (float) $proposal->credit_amount > 0) {
                $credit = -MoneyMath::round((string) $proposal->credit_amount);
                ClientInvoiceLine::create([
                    'client_invoice_id' => $invoice->client_invoice_id,
                    'client_agreement_id' => $agreement->id,
                    'description' => $proposal->credit_label ?: 'Credit',
                    'quantity' => '1',
                    'unit_price' => $credit,
                    'line_total' => $credit,
                    'line_type' => InvoiceLineType::Credit->value,
                    'line_date' => $acceptedAt->toDateString(),
                    'sort_order' => $sortOrder++,
                ]);
            }

            $invoice->recalculateTotal();

            // 5. Recurring (non-one-time) selected add-ons become agreement recurring items.
            foreach ($proposal->items as $item) {
                if ($item->kind === ProposalItemKind::AddOn
                    && $item->charge_cadence !== ChargeCadence::OneTime
                    && $item->is_selected) {
                    $agreement->recurringItems()->create([
                        'description' => $item->description,
                        'amount' => MoneyMath::round((string) $item->amount),
                        'charge_cadence' => $item->charge_cadence->value,
                        'anchor_day' => 1,
                        'start_date' => $activeDate->toDateString(),
                        'end_date' => null,
                        'is_taxable' => false,
                        'is_summarized' => false,
                    ]);
                }
            }

            // 6. Resolve / create the project.
            $project = $this->resolveProject($proposal, $user);

            // 7. Create tasks for scope items (mandatory, or optional+selected).
            $tasks = [];
            foreach ($proposal->items as $item) {
                if ($item->kind === ProposalItemKind::Scope && (! $item->is_optional || $item->is_selected)) {
                    $tasks[] = ClientTask::create([
                        'project_id' => $project->id,
                        'name' => $item->description,
                        'creator_user_id' => $user->id,
                    ]);
                }
            }

            // 8. Capture acceptance + links.
            $proposal->update([
                'status' => ProposalStatus::Accepted,
                'accepted_at' => $acceptedAt,
                'accepted_by_user_id' => $user->id,
                'accept_signature_name' => $name,
                'accept_signature_title' => $title,
                'agreement_id' => $agreement->id,
                'project_id' => $project->id,
            ]);

            // 9. Activity log.
            ClientCompanyActivity::record($company, 'proposal.accepted', $proposal, [
                'version' => $proposal->version,
                'agreement_id' => $agreement->id,
                'invoice_id' => $invoice->client_invoice_id,
                'project_id' => $project->id,
                'invoice_total' => (float) $invoice->invoice_total,
            ], $user->id);
            $company->touchLastActivity();

            return [
                'agreement' => $agreement,
                'invoice' => $invoice,
                'project' => $project,
                'tasks' => $tasks,
            ];
        });

        $this->notifyAdmin($proposal->fresh(['clientCompany', 'items']), 'accepted');

        return $result;
    }

    /**
     * Reject a proposal with a free-form reason.
     */
    public function reject(ClientProposal $proposal, User $user, string $reason): ClientProposal
    {
        return $this->recordClientResponse($proposal, $user, ProposalStatus::Rejected, 'proposal.rejected', $reason, 'rejected');
    }

    /**
     * Record a free-form change request from the client.
     */
    public function requestChanges(ClientProposal $proposal, User $user, string $message): ClientProposal
    {
        return $this->recordClientResponse($proposal, $user, ProposalStatus::ChangesRequested, 'proposal.changes_requested', $message, 'changes_requested');
    }

    /**
     * Upfront total breakdown for the currently-selected items (admin preview).
     *
     * @return array{subtotal: float, credit: float, net: float}
     */
    public function previewUpfrontTotal(ClientProposal $proposal): array
    {
        $proposal->loadMissing('items');

        return [
            'subtotal' => $proposal->upfrontSubtotal(),
            'credit' => (float) ($proposal->credit_amount ?? 0),
            'net' => $proposal->upfrontNet(),
        ];
    }

    /**
     * Shared reject / request-changes handler.
     */
    private function recordClientResponse(
        ClientProposal $proposal,
        User $user,
        ProposalStatus $status,
        string $action,
        string $message,
        string $mailAction,
    ): ClientProposal {
        if (! $proposal->isPending()) {
            throw new ClientManagementActionException('This proposal is not awaiting a decision.', 422);
        }

        DB::transaction(function () use ($proposal, $user, $status, $action, $message): void {
            $proposal->update([
                'status' => $status,
                'client_response_message' => $message,
                'response_name' => $user->name,
                'responded_at' => now(),
                'responded_by_user_id' => $user->id,
            ]);

            ClientCompanyActivity::record($proposal->clientCompany, $action, $proposal, [
                'version' => $proposal->version,
            ], $user->id);
            $proposal->clientCompany->touchLastActivity();
        });

        $this->notifyAdmin($proposal->fresh(['clientCompany', 'items']), $mailAction);

        return $proposal->fresh();
    }

    /**
     * Build the agreement retainer attributes from a proposal's retainer terms.
     *
     * For non-monthly cadences the per-cycle figures are stored as the
     * authoritative period overrides (`retainer_fee` / `retainer_hours`), which
     * {@see ClientAgreement::periodRetainerFee()} prefers, avoiding the rounding
     * drift a divide-to-monthly approach would introduce. The monthly_* fields
     * carry a divided "monthly equivalent" for display.
     *
     * @return array<string, mixed>
     */
    private function retainerAgreementAttributes(ClientProposal $proposal): array
    {
        $cadence = $proposal->retainerBillingCadence();

        if ($cadence === null) {
            return [
                'billing_cadence' => BillingCadence::Monthly->value,
                'monthly_retainer_fee' => 0,
                'monthly_retainer_hours' => 0,
                'hourly_rate' => 0,
                'retainer_fee' => null,
                'retainer_hours' => null,
            ];
        }

        $interval = $cadence->monthsInCycle();
        $perCycleFee = MoneyMath::round((string) $proposal->retainer_amount);
        $perCycleHours = round((float) ($proposal->retainer_included_hours ?? 0), 4);
        $hourlyRate = MoneyMath::round((string) ($proposal->retainer_hourly_rate ?? 0));

        if ($cadence === BillingCadence::Monthly) {
            return [
                'billing_cadence' => BillingCadence::Monthly->value,
                'monthly_retainer_fee' => $perCycleFee,
                'monthly_retainer_hours' => $perCycleHours,
                'hourly_rate' => $hourlyRate,
                'retainer_fee' => null,
                'retainer_hours' => null,
            ];
        }

        return [
            'billing_cadence' => $cadence->value,
            'monthly_retainer_fee' => MoneyMath::divide($perCycleFee, $interval),
            'monthly_retainer_hours' => round($perCycleHours / $interval, 4),
            'hourly_rate' => $hourlyRate,
            'retainer_fee' => $perCycleFee,
            'retainer_hours' => $perCycleHours,
        ];
    }

    /**
     * Find the linked project or create one from the proposal title.
     */
    private function resolveProject(ClientProposal $proposal, User $user): ClientProject
    {
        if ($proposal->project_id) {
            return ClientProject::query()
                ->where('client_company_id', $proposal->client_company_id)
                ->whereKey($proposal->project_id)
                ->firstOrFail();
        }

        $base = ClientProject::generateSlug($proposal->title) ?: 'proposal';
        $slug = $base;
        $suffix = 2;
        while (ClientProject::where('client_company_id', $proposal->client_company_id)->where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return ClientProject::create([
            'client_company_id' => $proposal->client_company_id,
            'name' => $proposal->title,
            'slug' => $slug,
            'creator_user_id' => $user->id,
        ]);
    }

    /**
     * Sync the proposal's items from a payload (create/update/delete).
     *
     * @param  array<int, array<string, mixed>>  $items
     */
    private function syncItems(ClientProposal $proposal, array $items): void
    {
        $keepIds = [];

        foreach ($items as $index => $item) {
            $payload = [
                'kind' => $item['kind'],
                'description' => $item['description'],
                'amount' => $item['amount'] ?? null,
                'charge_cadence' => $item['charge_cadence'] ?? ChargeCadence::OneTime->value,
                'is_optional' => (bool) ($item['is_optional'] ?? false),
                'sort_order' => $item['sort_order'] ?? $index,
            ];

            $existing = ! empty($item['id'])
                ? $proposal->items()->whereKey($item['id'])->first()
                : null;

            if ($existing !== null) {
                $existing->update($payload);
                $keepIds[] = $existing->id;
            } else {
                $keepIds[] = $proposal->items()->create($payload)->id;
            }
        }

        $proposal->items()->whereNotIn('id', $keepIds)->delete();
    }

    /**
     * Replicate the company-prefixed invoice number format used by
     * {@see ClientInvoicingService} (which keeps it protected).
     */
    private function generateInvoiceNumber(ClientCompany $company, Carbon $periodEnd): string
    {
        $rawPrefix = strtoupper(substr((string) preg_replace('/[^a-zA-Z0-9]/', '', (string) $company->company_name), 0, 4));
        $prefix = $rawPrefix !== '' ? "{$rawPrefix}-" : '';
        $yearMonth = $periodEnd->format('Ym');

        $lastInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->where('invoice_number', 'like', "{$rawPrefix}%{$yearMonth}-%")
            ->orderBy('invoice_number', 'desc')
            ->first();

        $seq = $lastInvoice ? ((int) substr((string) $lastInvoice->invoice_number, -3)) + 1 : 1;

        return sprintf('%s%s-%03d', $prefix, $yearMonth, $seq);
    }

    /**
     * Email the admin about a client action (best-effort; never breaks the action).
     */
    private function notifyAdmin(ClientProposal $proposal, string $action): void
    {
        $recipient = config('client-management.proposal_notification_email');

        if (empty($recipient)) {
            return;
        }

        try {
            Mail::to($recipient)->send(new ProposalActionMail($proposal, $action));
        } catch (\Throwable $e) {
            Log::warning('Failed to send proposal notification email', [
                'proposal_id' => $proposal->id,
                'action' => $action,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
