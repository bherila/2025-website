<?php

namespace Tests\Unit\Finance;

use App\Services\Finance\MoneyMath;
use PHPUnit\Framework\TestCase;

class MoneyMathTest extends TestCase
{
    public function test_round_and_sum_use_integer_cents(): void
    {
        $this->assertSame(0.3, MoneyMath::sum([0.1, 0.2]));
        $this->assertSame(1.01, MoneyMath::round('1.005'));
        $this->assertSame(-1.01, MoneyMath::round('-1.005'));
    }

    public function test_subtract_uses_integer_cents(): void
    {
        $this->assertSame(62740.16, MoneyMath::subtract('100673.07', '37932.91'));
    }

    public function test_multiply_and_divide_round_to_integer_cents(): void
    {
        $this->assertSame(60.45, MoneyMath::multiply('120.00', 0.5037659));
        $this->assertSame(33.33, MoneyMath::divide('100.00', 3));
    }

    public function test_allocate_ratio_round_trips_to_original_amount(): void
    {
        foreach (['0.01', '0.05', '1000.01', '-1000.01'] as $amount) {
            $allocation = MoneyMath::allocateRatio($amount, 40, 100);

            $this->assertSame(MoneyMath::round($amount), MoneyMath::sum([$allocation['allocated'], $allocation['remainder']]));
        }
    }

    public function test_allocate_ratio_assigns_rounding_remainder_to_second_bucket(): void
    {
        $allocation = MoneyMath::allocateRatio('0.01', 40, 100);

        $this->assertSame(0.0, $allocation['allocated']);
        $this->assertSame(0.01, $allocation['remainder']);
    }
}
