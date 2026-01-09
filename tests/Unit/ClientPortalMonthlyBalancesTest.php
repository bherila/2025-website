<?php

namespace Tests\Unit;

use App\Http\Controllers\ClientManagement\ClientPortalApiController;
use App\Models\ClientManagement\ClientAgreement;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientTimeEntry;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use ReflectionMethod;
use Tests\TestCase;

class ClientPortalMonthlyBalancesTest extends TestCase
{
    public function test_pre_agreement_hours_applied_to_first_active_month(): void
    {
        $controller = new ClientPortalApiController;

        // Stub company that returns an active agreement starting 2026-01-01
        $company = new class extends ClientCompany {
            public ClientAgreement $agreement;

            public function activeAgreement()
            {
                return $this->agreement;
            }
        };

        $agreement = new ClientAgreement;
        $agreement->monthly_retainer_hours = 10;
        $agreement->rollover_months = 1;
        $agreement->active_date = Carbon::create(2026, 1, 1, 0, 0, 0, 'UTC');
        $company->agreement = $agreement;

        $entries = new Collection([
            new ClientTimeEntry([
                'date_worked' => Carbon::create(2025, 12, 15, 12, 0, 0, 'UTC'),
                'minutes_worked' => 60,
                'is_billable' => true,
            ]),
            new ClientTimeEntry([
                'date_worked' => Carbon::create(2026, 1, 5, 12, 0, 0, 'UTC'),
                'minutes_worked' => 60,
                'is_billable' => true,
            ]),
        ]);

        $method = new ReflectionMethod(ClientPortalApiController::class, 'calculateMonthlyBalances');
        $method->setAccessible(true);

        $result = $method->invoke($controller, $company, $entries);

        // Results are returned most recent first
        $this->assertCount(2, $result);

        $january = $result[0];
        $december = $result[1];

        $this->assertSame('2026-01', $january['year_month']);
        $this->assertTrue($january['has_agreement']);
        $this->assertEquals(8.0, $january['closing']['unused_hours']);
        $this->assertEquals(0.0, $january['closing']['remaining_rollover']);

        $this->assertSame('2025-12', $december['year_month']);
        $this->assertFalse($december['has_agreement']);
        $this->assertEquals(1.0, $december['unbilled_hours']);
        $this->assertTrue($december['will_be_billed_in_next_agreement']);
    }
}
