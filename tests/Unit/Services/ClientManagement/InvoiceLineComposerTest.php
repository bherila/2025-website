<?php

namespace Tests\Unit\Services\ClientManagement;

use App\Enums\ClientManagement\InvoiceLineType;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientInvoice;
use App\Models\ClientManagement\ClientInvoiceLine;
use App\Models\ClientManagement\ClientProject;
use App\Models\ClientManagement\ClientTimeEntry;
use App\Services\ClientManagement\DataTransferObjects\TimeEntryFragment;
use App\Services\ClientManagement\InvoiceLineComposer;
use App\Services\ClientManagement\TimeEntrySplitter;
use Carbon\Carbon;
use Tests\TestCase;

class InvoiceLineComposerTest extends TestCase
{
    public function test_add_deferred_termination_line_links_entries_to_generated_line(): void
    {
        $company = ClientCompany::factory()->create();
        $project = ClientProject::factory()->for($company)->create();
        $agreement = ClientAgreement::factory()->for($company)->create([
            'hourly_rate' => 150,
        ]);
        $invoice = $this->createInvoice($company, $agreement);
        $firstEntry = ClientTimeEntry::factory()
            ->for($company, 'clientCompany')
            ->for($project, 'project')
            ->deferred()
            ->create(['minutes_worked' => 90]);
        $secondEntry = ClientTimeEntry::factory()
            ->for($company, 'clientCompany')
            ->for($project, 'project')
            ->deferred()
            ->create(['minutes_worked' => 45]);
        $sortOrder = 4;

        (new InvoiceLineComposer)->addDeferredTerminationLine(
            $invoice,
            $agreement,
            collect([$firstEntry, $secondEntry]),
            $sortOrder,
        );

        $line = ClientInvoiceLine::query()->sole();
        $this->assertSame($invoice->client_invoice_id, $line->client_invoice_id);
        $this->assertSame($agreement->id, $line->client_agreement_id);
        $this->assertSame(InvoiceLineType::AdditionalHours->value, $line->line_type);
        $this->assertSame('2.25', $line->quantity);
        $this->assertSame(2.25, (float) $line->hours);
        $this->assertSame(337.5, (float) $line->line_total);
        $this->assertSame(4, $line->sort_order);
        $this->assertSame(5, $sortOrder);
        $this->assertSame($line->client_invoice_line_id, $firstEntry->fresh()->client_invoice_line_id);
        $this->assertSame($line->client_invoice_line_id, $secondEntry->fresh()->client_invoice_line_id);
    }

    public function test_link_all_fragments_to_lines_splits_entries_between_lines(): void
    {
        $company = ClientCompany::factory()->create();
        $project = ClientProject::factory()->for($company)->create();
        $agreement = ClientAgreement::factory()->for($company)->create();
        $invoice = $this->createInvoice($company, $agreement);
        $firstLine = $this->createLine($invoice, $agreement, 1);
        $secondLine = $this->createLine($invoice, $agreement, 2);
        $entry = ClientTimeEntry::factory()
            ->for($company, 'clientCompany')
            ->for($project, 'project')
            ->create([
                'date_worked' => '2026-04-15',
                'minutes_worked' => 120,
                'name' => 'Split entry',
            ]);

        (new InvoiceLineComposer)->linkAllFragmentsToLines([
            $firstLine->client_invoice_line_id => [
                $this->fragmentFor($entry, 45),
            ],
            $secondLine->client_invoice_line_id => [
                $this->fragmentFor($entry, 75),
            ],
        ], new TimeEntrySplitter);

        $primary = $entry->fresh();
        $overflow = ClientTimeEntry::query()
            ->whereKeyNot($entry->id)
            ->where('name', 'Split entry')
            ->sole();

        $this->assertSame(45, $primary->minutes_worked);
        $this->assertSame($firstLine->client_invoice_line_id, $primary->client_invoice_line_id);
        $this->assertSame(75, $overflow->minutes_worked);
        $this->assertSame($secondLine->client_invoice_line_id, $overflow->client_invoice_line_id);
    }

    private function createInvoice(ClientCompany $company, ClientAgreement $agreement): ClientInvoice
    {
        return ClientInvoice::create([
            'client_company_id' => $company->id,
            'client_agreement_id' => $agreement->id,
            'period_start' => Carbon::parse('2026-04-01'),
            'period_end' => Carbon::parse('2026-04-30'),
            'invoice_number' => 'INV-TEST-202604',
            'status' => 'draft',
        ]);
    }

    private function createLine(ClientInvoice $invoice, ClientAgreement $agreement, int $sortOrder): ClientInvoiceLine
    {
        return ClientInvoiceLine::create([
            'client_invoice_id' => $invoice->client_invoice_id,
            'client_agreement_id' => $agreement->id,
            'description' => "Line {$sortOrder}",
            'quantity' => '1',
            'unit_price' => 0,
            'line_total' => 0,
            'line_type' => InvoiceLineType::PriorMonthRetainer->value,
            'hours' => 0,
            'line_date' => Carbon::parse('2026-04-30'),
            'sort_order' => $sortOrder,
        ]);
    }

    private function fragmentFor(ClientTimeEntry $entry, int $minutes): TimeEntryFragment
    {
        return new TimeEntryFragment(
            originalTimeEntryId: $entry->id,
            minutes: $minutes,
            dateWorked: $entry->date_worked->format('Y-m-d'),
            description: $entry->name,
            userId: $entry->user_id,
        );
    }
}
