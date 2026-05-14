<?php

namespace App\Services\ClientManagement;

use App\Exceptions\ClientManagement\ClientManagementActionException;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Models\User;
use Illuminate\Support\Facades\Log;

class ClientTimeEntryService
{
    public function __construct(private readonly ClientInvoicingService $invoicingService) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public function create(ClientCompany $company, array $data, User $actor): ClientTimeEntry
    {
        $validated = $this->normalizeData($company, $data, false);
        $this->assertDateIsNotCoveredByIssuedInvoice($company, (string) $validated['date_worked']);

        $entry = ClientTimeEntry::create([
            'project_id' => $validated['project_id'],
            'client_company_id' => $company->id,
            'task_id' => $validated['task_id'] ?? null,
            'name' => $validated['name'] ?? null,
            'minutes_worked' => $validated['minutes_worked'],
            'date_worked' => $validated['date_worked'],
            'user_id' => $validated['user_id'] ?? $actor->id,
            'creator_user_id' => $actor->id,
            'is_billable' => $validated['is_billable'] ?? true,
            'is_deferred_billing' => $validated['is_deferred_billing'] ?? false,
            'job_type' => $validated['job_type'] ?? 'Software Development',
        ]);

        $this->regenerateDraftInvoicesForDate($company);

        return $entry->load(['user:id,name,email', 'project:id,name,slug', 'task:id,name']);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function update(ClientCompany $company, int $entryId, array $data, User $actor): ClientTimeEntry
    {
        $entry = ClientTimeEntry::where('client_company_id', $company->id)->findOrFail($entryId);

        if ($entry->isOnIssuedInvoice()) {
            throw new ClientManagementActionException('Cannot update time entries on issued invoices.', 403);
        }

        $validated = $this->normalizeData($company, $data, true);

        if (isset($validated['date_worked'])) {
            $this->assertDateIsNotCoveredByIssuedInvoice($company, (string) $validated['date_worked']);
        }

        if ($entry->isLinkedToInvoice()) {
            $entry->update(['client_invoice_line_id' => null]);
        }

        $entry->update($validated);
        $this->regenerateDraftInvoicesForDate($company);

        return $entry->fresh(['user:id,name,email', 'project:id,name,slug', 'task:id,name']) ?? $entry;
    }

    public function delete(ClientCompany $company, int $entryId): void
    {
        $entry = ClientTimeEntry::where('client_company_id', $company->id)->findOrFail($entryId);

        if ($entry->isOnIssuedInvoice()) {
            throw new ClientManagementActionException('Cannot delete time entries on issued invoices.', 403);
        }

        if ($entry->isLinkedToInvoice()) {
            $entry->update(['client_invoice_line_id' => null]);
        }

        $entry->delete();
        $this->regenerateDraftInvoicesForDate($company);
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalizeData(ClientCompany $company, array $data, bool $isUpdate): array
    {
        if (isset($data['project_id'])) {
            ClientProject::where('id', $data['project_id'])
                ->where('client_company_id', $company->id)
                ->firstOrFail();
        }

        if (isset($data['time'])) {
            $minutes = ClientTimeEntry::parseTimeToMinutes((string) $data['time']);

            if ($minutes <= 0) {
                throw new ClientManagementActionException('Invalid time format. Use h:mm or decimal hours.', 422);
            }

            $data['minutes_worked'] = $minutes;
            unset($data['time']);
        } elseif (! $isUpdate && ! isset($data['minutes_worked'])) {
            throw new ClientManagementActionException('A time value is required.', 422);
        }

        if (array_key_exists('is_billable', $data) && $this->toBool($data['is_billable']) === false) {
            $data['is_billable'] = false;
            $data['is_deferred_billing'] = false;
        } elseif (array_key_exists('is_billable', $data)) {
            $data['is_billable'] = true;
        }

        if (array_key_exists('is_deferred_billing', $data)) {
            $data['is_deferred_billing'] = $this->toBool($data['is_deferred_billing']);
        }

        return $data;
    }

    private function assertDateIsNotCoveredByIssuedInvoice(ClientCompany $company, string $dateWorked): void
    {
        $issuedInvoice = ClientInvoice::where('client_company_id', $company->id)
            ->whereIn('status', ['issued', 'paid'])
            ->where('period_start', '<=', $dateWorked)
            ->where('period_end', '>=', $dateWorked)
            ->first();

        if ($issuedInvoice) {
            throw new ClientManagementActionException(
                'Cannot add time entries to periods covered by issued invoices. The period '.
                $issuedInvoice->period_start->format('M j, Y').' - '.
                $issuedInvoice->period_end->format('M j, Y').
                ' is already invoiced.',
                403
            );
        }
    }

    private function regenerateDraftInvoicesForDate(ClientCompany $company): void
    {
        $draftInvoices = ClientInvoice::where('client_company_id', $company->id)
            ->where('status', 'draft')
            ->orderBy('period_start')
            ->get();

        foreach ($draftInvoices as $invoice) {
            try {
                $this->invoicingService->generateInvoice(
                    $company,
                    $invoice->period_start,
                    $invoice->period_end
                );
            } catch (\Exception $e) {
                Log::warning('Failed to regenerate draft invoice on time entry change', [
                    'invoice_id' => $invoice->client_invoice_id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function toBool(mixed $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}
