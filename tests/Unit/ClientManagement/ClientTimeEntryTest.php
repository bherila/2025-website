<?php

namespace Tests\Unit\ClientManagement;

use App\Models\ClientManagement\ClientTimeEntry;
use Tests\TestCase;

class ClientTimeEntryTest extends TestCase
{
    /**
     * Test time parsing logic.
     */
    public function test_parse_time_to_minutes(): void
    {
        // Colon format
        $this->assertEquals(90, ClientTimeEntry::parseTimeToMinutes('1:30'));
        $this->assertEquals(150, ClientTimeEntry::parseTimeToMinutes('2:30'));
        $this->assertEquals(5, ClientTimeEntry::parseTimeToMinutes('0:05'));
        $this->assertEquals(65, ClientTimeEntry::parseTimeToMinutes('1:05'));

        // Decimal format
        $this->assertEquals(90, ClientTimeEntry::parseTimeToMinutes('1.5'));
        $this->assertEquals(75, ClientTimeEntry::parseTimeToMinutes('1.25'));
        $this->assertEquals(60, ClientTimeEntry::parseTimeToMinutes('1'));
        $this->assertEquals(30, ClientTimeEntry::parseTimeToMinutes('0.5'));

        // 'h' suffix format
        $this->assertEquals(90, ClientTimeEntry::parseTimeToMinutes('1.5h'));
        $this->assertEquals(120, ClientTimeEntry::parseTimeToMinutes('2h'));
        $this->assertEquals(45, ClientTimeEntry::parseTimeToMinutes('0.75h'));
        $this->assertEquals(30, ClientTimeEntry::parseTimeToMinutes('.5h'));
        $this->assertEquals(90, ClientTimeEntry::parseTimeToMinutes('1.5H')); // case insensitive

        // Trim and whitespace
        $this->assertEquals(60, ClientTimeEntry::parseTimeToMinutes(' 1h '));
        $this->assertEquals(90, ClientTimeEntry::parseTimeToMinutes(' 1.5 '));

        // Invalid formats
        $this->assertEquals(0, ClientTimeEntry::parseTimeToMinutes('abc'));
        $this->assertEquals(0, ClientTimeEntry::parseTimeToMinutes(''));
    }
}
