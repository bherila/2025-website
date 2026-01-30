<?php

namespace Tests\Unit\ClientManagement;

use App\Models\ClientManagement\ClientInvoiceLine;
use Tests\TestCase;

class ClientInvoiceLineTest extends TestCase
{
    /**
     * Test line total calculation with different quantity formats.
     */
    public function test_calculate_total_with_various_quantities(): void
    {
        $line = new ClientInvoiceLine();
        $line->unit_price = 100.00;

        // Decimal quantity
        $line->quantity = '1.5';
        $line->calculateTotal();
        $this->assertEquals(150.00, (float) $line->line_total);

        // h:mm quantity
        $line->quantity = '1:30';
        $line->calculateTotal();
        $this->assertEquals(150.00, (float) $line->line_total);

        // h:mm quantity with more minutes
        $line->quantity = '0:45';
        $line->calculateTotal();
        $this->assertEquals(75.00, (float) $line->line_total);

        // Quantity with 'h' suffix
        $line->quantity = '2.5h';
        $line->calculateTotal();
        $this->assertEquals(250.00, (float) $line->line_total);

        // Flat quantity
        $line->quantity = '10';
        $line->calculateTotal();
        $this->assertEquals(1000.00, (float) $line->line_total);
    }
}