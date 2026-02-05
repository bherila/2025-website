<?php

namespace App\Services\ClientManagement;

use App\Models\ClientManagement\ClientTimeEntry;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Service for managing time entry allocations and recombination.
 *
 * This service handles the lifecycle of split time entries, including
 * merging fragments back together when they become unlinked.
 */
class AllocationService
{
    /**
     * Recombine unlinked time entry fragments that share the same merge keys.
     * Only recombines fragments where ALL fragments with matching keys are unlinked.
     *
     * Merge keys consist of: date_worked, user_id, name, project_id, task_id
     *
     * @param int $clientCompanyId The client company to process
     * @return int Number of entries recombined
     */
    public function recombineUnlinkedFragments(int $clientCompanyId): int
    {
        return DB::transaction(function () use ($clientCompanyId) {
            $recombinedCount = 0;

            // Get all unlinked time entries for this client
            $unlinkedEntries = ClientTimeEntry::where('client_company_id', $clientCompanyId)
                ->whereNull('client_invoice_line_id')
                ->orderBy('date_worked')
                ->orderBy('user_id')
                ->orderBy('name')
                ->orderBy('id')
                ->get();

            // Group by merge keys
            $groups = $unlinkedEntries->groupBy(function ($entry) {
                return $this->getMergeKey($entry);
            });

            // Process each group
            foreach ($groups as $mergeKey => $entries) {
                // Only recombine if we have multiple entries with the same keys
                if ($entries->count() > 1) {
                    // Verify ALL entries with these keys are unlinked
                    if ($this->allEntriesUnlinked($clientCompanyId, $entries->first())) {
                        $this->mergeEntries($entries);
                        $recombinedCount += $entries->count() - 1; // Count merged entries
                    }
                }
            }

            return $recombinedCount;
        });
    }

    /**
     * Check if time entries can be merged.
     *
     * Entries can merge if they share the same date, user, description, project, task,
     * and ALL entries are unlinked from invoices.
     *
     * @param Collection $entries Collection of ClientTimeEntry models
     * @return bool
     */
    protected function canMergeEntries(Collection $entries): bool
    {
        if ($entries->count() < 2) {
            return false;
        }

        // Check if all entries are unlinked
        if ($entries->contains(fn ($entry) => $entry->client_invoice_line_id !== null)) {
            return false;
        }

        // Check if all entries share the same merge keys
        $first = $entries->first();
        $firstKey = $this->getMergeKey($first);

        return $entries->every(fn ($entry) => $this->getMergeKey($entry) === $firstKey);
    }

    /**
     * Merge multiple time entries into one by summing minutes.
     * Keeps the first entry (by ID), deletes the rest.
     *
     * @param Collection $entries Collection of ClientTimeEntry models to merge
     * @return ClientTimeEntry The merged entry
     * @throws \InvalidArgumentException If entries cannot be merged
     */
    protected function mergeEntries(Collection $entries): ClientTimeEntry
    {
        if (! $this->canMergeEntries($entries)) {
            throw new \InvalidArgumentException('Cannot merge entries: they are linked or have different merge keys');
        }

        return DB::transaction(function () use ($entries) {
            // Sort by ID to keep the first entry
            $sorted = $entries->sortBy('id');
            $primary = $sorted->first();
            $toDelete = $sorted->skip(1);

            // Sum all minutes
            $totalMinutes = $entries->sum('minutes_worked');

            // Update the primary entry
            $primary->update([
                'minutes_worked' => $totalMinutes,
            ]);

            // Delete the rest
            foreach ($toDelete as $entry) {
                $entry->delete();
            }

            return $primary->fresh();
        });
    }

    /**
     * Generate a merge key for a time entry.
     *
     * Entries with the same merge key are candidates for recombination.
     *
     * @param ClientTimeEntry $entry
     * @return string
     */
    protected function getMergeKey(ClientTimeEntry $entry): string
    {
        return implode('|', [
            $entry->date_worked->format('Y-m-d'),
            $entry->user_id,
            $entry->name,
            $entry->project_id ?? 'null',
            $entry->task_id ?? 'null',
        ]);
    }

    /**
     * Check if all entries with the same merge keys as the given entry are unlinked.
     *
     * @param int $clientCompanyId
     * @param ClientTimeEntry $sampleEntry Sample entry to derive merge keys from
     * @return bool
     */
    protected function allEntriesUnlinked(int $clientCompanyId, ClientTimeEntry $sampleEntry): bool
    {
        $query = ClientTimeEntry::where('client_company_id', $clientCompanyId)
            ->where('date_worked', $sampleEntry->date_worked)
            ->where('user_id', $sampleEntry->user_id)
            ->where('name', $sampleEntry->name);

        // Handle nullable fields
        if ($sampleEntry->project_id === null) {
            $query->whereNull('project_id');
        } else {
            $query->where('project_id', $sampleEntry->project_id);
        }

        if ($sampleEntry->task_id === null) {
            $query->whereNull('task_id');
        } else {
            $query->where('task_id', $sampleEntry->task_id);
        }

        // Check if any are linked
        return $query->whereNotNull('client_invoice_line_id')->count() === 0;
    }
}
