<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StatementControllerTest extends TestCase
{
    use RefreshDatabase;

    public function test_import_pdf_statement_truncates_dates(): void
    {
        $user = $this->createAdminUser(['gemini_api_key' => 'test-key']);
        $acctId = DB::table('fin_accounts')->insertGetId([
            'acct_owner' => $user->id,
            'acct_name' => 'X',
            'acct_last_balance' => '0',
        ]);

        $payload = [
            'statementInfo' => [
                'periodStart' => '2025-01-01T12:34:56Z',
                'periodEnd' => '2025-01-31T23:59:59-05:00',
                'closingBalance' => 1234.56,
            ],
            'statementDetails' => []
        ];

        $response = $this->actingAs($user)->postJson("/api/finance/{$acctId}/import-pdf-statement", $payload);
        $response->assertOk();

        $this->assertDatabaseHas('fin_statements', [
            'acct_id' => $acctId,
            'statement_closing_date' => '2025-01-31',
        ]);
    }
}
