<?php

namespace App\Console\Commands;

use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientTimeEntry;
use Illuminate\Console\Command;

class CleanupOrphanedInvoices extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:cleanup-orphaned-invoices';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Cleanup orphaned invoice lines and unlink time entries from soft-deleted invoices';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $this->info('Starting orphaned invoice cleanup...');

        // 1. Find all ClientInvoiceLine which are pointing to a soft-deleted ClientInvoice
        $orphanedLinesQuery = ClientInvoiceLine::whereIn('client_invoice_id', function($query) {
            $query->select('client_invoice_id')
                ->from('client_invoices')
                ->whereNotNull('deleted_at');
        });

        $orphanedLinesCount = $orphanedLinesQuery->count();
        $this->info("Found {$orphanedLinesCount} lines pointing to soft-deleted invoices.");

        if ($orphanedLinesCount > 0) {
            $orphanedLines = $orphanedLinesQuery->get();
            foreach ($orphanedLines as $line) {
                // This will trigger our new booted deleting event and unlink time entries
                $line->delete();
            }
            $this->info('Orphaned lines deleted and associated time entries unlinked.');
        }

        // 2. Find all ClientTimeEntry which are pointing to a soft-deleted ClientInvoiceLine
        // (In case some lines were already soft-deleted but didn't unlink their time entries)
        $orphanedTimeEntriesQuery = ClientTimeEntry::whereIn('client_invoice_line_id', function($query) {
            $query->select('client_invoice_line_id')
                ->from('client_invoice_lines')
                ->whereNotNull('deleted_at');
        });

        $orphanedTimeEntriesCount = $orphanedTimeEntriesQuery->count();
        $this->info("Found {$orphanedTimeEntriesCount} time entries pointing to soft-deleted lines.");

        if ($orphanedTimeEntriesCount > 0) {
            $orphanedTimeEntriesQuery->update(['client_invoice_line_id' => null]);
            $this->info('Orphaned time entries unlinked.');
        }

        $this->info('Cleanup completed successfully.');
    }
}
