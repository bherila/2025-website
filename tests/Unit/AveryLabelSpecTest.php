<?php

namespace Tests\Unit;

use App\Support\AveryLabelSpec;
use Tests\TestCase;

class AveryLabelSpecTest extends TestCase
{
    public function test_launch_sheet_matrix_has_expected_label_counts(): void
    {
        $expectedCounts = [
            '5160' => 30,
            '8160' => 30,
            '5161' => 20,
            '8161' => 20,
            '5162' => 14,
            '8162' => 14,
            '5163' => 10,
            '8163' => 10,
            '48163' => 10,
            '5164' => 6,
        ];

        foreach ($expectedCounts as $sheetNumber => $labelsPerPage) {
            $spec = new AveryLabelSpec($sheetNumber);

            $this->assertSame($labelsPerPage, $spec->labelsPerPage());
        }
    }
}
