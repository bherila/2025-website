<?php

namespace Database\Seeders\Finance;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Seeds demo tax documents covering several form types and parsed_data schema variants:
 *
 *  K-1 records:
 *  - "legacy" flat format (no schemaVersion): mirrors records imported before the
 *    canonical FK1StructuredData shape was established. Used by K1LegacyTransformer tests.
 *  - "canonical" schemaVersion "2026.1" format: produced by GenAiJobDispatcherService::coerceK1Args.
 *
 *  Other form types:
 *  - W-2: employer wage statement
 *  - 1099-INT: interest income (bank and money-market accounts)
 *  - 1099-DIV: dividend income (brokerage)
 *  - broker_1099: consolidated brokerage statement container (sub-forms on fin_tax_document_accounts)
 *
 * All values are synthetic/anonymized — no real names, EINs, SSNs, or account numbers.
 */
class FinanceTaxDocumentsSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->where('email', 'test@example.com')->first();

        if (! $user) {
            return;
        }

        $now = now();

        // Required non-null fields that carry no business meaning for demo records.
        $stub = [
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 0,
            'file_hash' => '0000000000000000000000000000000000000000000000000000000000000000',
        ];

        // --- Legacy flat-format K-1 (Form 1065, simple fund) ---
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-k1-legacy-simple.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => 'k1',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'form_source' => 1065,
                    'tax_year' => 2025,
                    'partner_type' => 'INDIVIDUAL',
                    'partner_name' => 'Demo Partner',
                    'partner_ssn_last4' => '0000',
                    'partner_ownership_pct' => 0.01007,
                    'entity_name' => 'Demo Fund A LP',
                    'entity_ein' => '00-0000001',
                    'state' => 'DE',
                    'state_tax_withheld' => 0,
                    'box1_ordinary_income' => 0,
                    'box2_net_rental_real_estate' => 0,
                    'box3_other_net_rental' => 0,
                    'box4_guaranteed_payments_services' => 0,
                    'box5_guaranteed_payments_capital' => 0,
                    'box6_guaranteed_payments_total' => 0,
                    'box7_net_section_1231_gain' => 0,
                    'box8_other_income' => 0,
                    'box9_section_179_deduction' => 0,
                    'box10_other_deductions' => 1020,
                    'distributions' => 0,
                    'credits' => [],
                    'amt_items' => [
                        ['code' => '8', 'description' => 'Net short-term capital gain (loss)', 'amount' => -209],
                    ],
                    'other_coded_items' => [
                        ['code' => '13AE', 'description' => 'Other deductions - portfolio income (2% floor)', 'amount' => 1020],
                    ],
                    'other_info_items' => [
                        ['code' => 'K1', 'description' => 'Nonrecourse liabilities (Ending)', 'amount' => 1412],
                    ],
                    'supplemental_statements' => 'Management fees $800. Other deductions $220.',
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- Legacy flat-format K-1 (Form 1065, fund with coded items across multiple states) ---
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-k1-legacy-multi-state.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => 'k1',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'form_source' => 1065,
                    'tax_year' => 2025,
                    'partner_type' => 'INDIVIDUAL',
                    'partner_name' => 'Demo Partner',
                    'partner_ssn_last4' => '0000',
                    'partner_ownership_pct' => 0.009961,
                    'entity_name' => 'Demo Fund B LP',
                    'entity_ein' => '00-0000002',
                    'state' => 'GA, NJ, NY, PA, WI',
                    'state_tax_withheld' => 0,
                    'box1_ordinary_income' => 0,
                    'box2_net_rental_real_estate' => 0,
                    'box3_other_net_rental' => 0,
                    'box4_guaranteed_payments_services' => 0,
                    'box5_guaranteed_payments_capital' => 0,
                    'box6_guaranteed_payments_total' => 0,
                    'box7_net_section_1231_gain' => 0,
                    'box8_other_income' => 21,
                    'box9_section_179_deduction' => 0,
                    'box10_other_deductions' => 1020,
                    'distributions' => 0,
                    'credits' => [],
                    'amt_items' => [],
                    'other_coded_items' => [
                        ['description' => 'Interest income', 'amount' => 21, 'code' => '5'],
                        ['description' => 'Net long-term capital gain (loss)', 'amount' => -500, 'code' => '9a'],
                        ['code' => '13AE', 'description' => 'Other deductions - portfolio income (2% floor)', 'amount' => 1020],
                    ],
                    'other_info_items' => [
                        ['code' => '20A', 'amount' => 21, 'description' => 'Investment income'],
                    ],
                    'supplemental_statements' => 'Management fees $796. Other deductions $224.',
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- Canonical schemaVersion "2026.1" K-1 (complex fund) ---
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-k1-canonical.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => 'k1',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'schemaVersion' => '2026.1',
                    'formType' => 'K-1-1065',
                    'pages' => 10,
                    'fields' => [
                        'A' => ['value' => '00-0000003'],
                        'B' => ['value' => 'Demo Fund C LLC'],
                        'E' => ['value' => 'XXX-XX-0000'],
                        'F' => ['value' => 'Demo Partner'],
                        'G' => ['value' => 'LIMITED_PARTNER'],
                        'I1' => ['value' => 'INDIVIDUAL'],
                        'J' => ['value' => 'Beginning: 0.000000, Ending: 0.042400'],
                        '5' => ['value' => '1234'],
                        '6a' => ['value' => '567'],
                        '6b' => ['value' => '450'],
                    ],
                    'codes' => [
                        '11' => [
                            ['code' => 'C', 'value' => '5000', 'notes' => 'Section 1256 contracts.'],
                            ['code' => 'S', 'value' => '-2000', 'notes' => 'Net short-term capital loss.'],
                        ],
                        '13' => [
                            ['code' => 'H', 'value' => '300', 'notes' => 'Investment interest expense.'],
                        ],
                        '20' => [
                            ['code' => 'A', 'value' => '2500', 'notes' => 'Investment income.'],
                        ],
                    ],
                    'k3' => ['sections' => []],
                    'raw_text' => 'Tax Year: 2025. UBTI: 0.',
                    'warnings' => [],
                    'extraction' => [
                        'model' => 'gemini',
                        'version' => '2026.1',
                        'timestamp' => '2026-04-01T00:00:00+00:00',
                        'source' => 'ai',
                    ],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- W-2: employer wage statement ---
        // Demo amounts modeled after a typical software-industry W-2.
        // box12 entries: D = 401(k) elective deferrals, DD = employer-sponsored health coverage cost.
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-w2-2025.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => 'w2',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'employer_name' => 'Demo Employer Inc.',
                    'employer_ein' => '00-0000010',
                    'employee_name' => 'Demo Employee',
                    'employee_ssn_last4' => '0000',
                    'box1_wages' => 95000.00,
                    'box2_fed_tax' => 21850.00,
                    'box3_ss_wages' => 95000.00,
                    'box4_ss_tax' => 5890.00,
                    'box5_medicare_wages' => 95000.00,
                    'box6_medicare_tax' => 1377.50,
                    'box7_ss_tips' => null,
                    'box8_allocated_tips' => null,
                    'box10_dependent_care' => null,
                    'box11_nonqualified' => null,
                    'box12' => [
                        ['code' => 'D', 'amount' => 7500.00],
                        ['code' => 'DD', 'amount' => 3240.00],
                    ],
                    'box13_statutory' => false,
                    'box13_retirement' => true,
                    'box13_third_party_sick' => false,
                    'box14' => [],
                    'box15_state' => 'CA',
                    'box16_state_wages' => 95000.00,
                    'box17_state_tax' => 7600.00,
                    'box18_local_wages' => null,
                    'box19_local_tax' => null,
                    'box20_locality' => null,
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- 1099-INT: bank savings interest (Ally-style account) ---
        // Representative of a high-yield savings account paying ~$4,025/year.
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-1099-int-bank-2025.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => '1099_int',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'payer_name' => 'Demo Online Bank',
                    'payer_tin' => '00-0000020',
                    'recipient_name' => 'Demo Taxpayer',
                    'recipient_tin_last4' => '0000',
                    'account_number' => 'XXXX0001',
                    'box1_interest' => 4024.92,
                    'box2_early_withdrawal' => null,
                    'box3_savings_bond' => null,
                    'box4_fed_tax' => null,
                    'box5_investment_expense' => null,
                    'box6_foreign_tax' => null,
                    'box7_foreign_country' => null,
                    'box8_tax_exempt' => null,
                    'box9_private_activity' => null,
                    'box10_market_discount' => null,
                    'box11_bond_premium' => null,
                    'box12_treasury_premium' => null,
                    'box13_tax_exempt_premium' => null,
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- 1099-INT: money market / cash account interest (Wealthfront-style) ---
        // Representative of a cash management account paying ~$6,835/year.
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-1099-int-cash-2025.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => '1099_int',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'payer_name' => 'Demo Cash Management LLC',
                    'payer_tin' => '00-0000021',
                    'recipient_name' => 'Demo Taxpayer',
                    'recipient_tin_last4' => '0000',
                    'account_number' => 'XXXX0002',
                    'box1_interest' => 6835.49,
                    'box2_early_withdrawal' => null,
                    'box3_savings_bond' => null,
                    'box4_fed_tax' => null,
                    'box5_investment_expense' => null,
                    'box6_foreign_tax' => null,
                    'box7_foreign_country' => null,
                    'box8_tax_exempt' => null,
                    'box9_private_activity' => null,
                    'box10_market_discount' => null,
                    'box11_bond_premium' => null,
                    'box12_treasury_premium' => null,
                    'box13_tax_exempt_premium' => null,
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- 1099-DIV: standalone dividend income (SMA-style account) ---
        // Modeled after a separately managed equity account with ~$7,926 ordinary dividends.
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-1099-div-sma-2025.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => '1099_div',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'payer_name' => 'Demo Brokerage Services LLC',
                    'payer_tin' => '00-0000030',
                    'recipient_name' => 'Demo Taxpayer',
                    'recipient_tin_last4' => '0000',
                    'account_number' => 'XXXX3001',
                    'box1a_ordinary' => 7926.03,
                    'box1b_qualified' => 5909.12,
                    'box2a_cap_gain' => 175.42,
                    'box2b_unrecap_1250' => 34.81,
                    'box2c_section_1202' => null,
                    'box2d_collectibles' => null,
                    'box2e_section_897_ordinary' => null,
                    'box2f_section_897_cap_gain' => null,
                    'box3_nondividend' => 50.51,
                    'box4_fed_tax' => null,
                    'box5_section_199a' => null,
                    'box6_investment_expense' => null,
                    'box7_foreign_tax' => null,
                    'box9_cash_liquidation' => null,
                    'box10_noncash_liquidation' => null,
                    'box11_exempt_interest' => null,
                    'box12_private_activity' => null,
                    'box14_state_tax' => null,
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );

        // --- broker_1099: consolidated brokerage statement (container type) ---
        // This is the PDF-level container for a multi-section brokerage 1099.
        // Individual sub-form types (1099-DIV, 1099-INT, 1099-B) are linked via
        // fin_tax_document_accounts rows, not stored directly in parsed_data.
        // Modeled after a brokerage account with both dividends (~$25,535) and
        // capital gains activity.
        DB::table('fin_tax_documents')->updateOrInsert(
            ['user_id' => $user->id, 'original_filename' => 'demo-broker-1099-2025.pdf'],
            array_merge($stub, [
                'tax_year' => 2025,
                'form_type' => 'broker_1099',
                'genai_status' => 'parsed',
                'is_reviewed' => false,
                'parsed_data' => json_encode([
                    'payer_name' => 'Demo Brokerage Services LLC',
                    'payer_tin' => '00-0000030',
                    'account_number' => 'XXXX3002',
                    'tax_year' => 2025,
                    'statement_date' => '2026-01-31',
                    'statement_pages' => 24,
                    'dividends' => [
                        'box1a_ordinary' => 25535.01,
                        'box1b_qualified' => 8527.43,
                        'box3_nondividend' => 2724.65,
                        'box11_exempt_interest' => 567.62,
                        'box12_private_activity' => 567.62,
                    ],
                    'interest' => [
                        'box3_savings_bond' => 12335.09,
                    ],
                    'capital_gains' => [
                        [
                            'term' => 'short',
                            'form8949Box' => 'A',
                            'description' => 'Short-term transactions reported to IRS with basis (Box A)',
                            'proceeds' => 198000.00,
                            'cost_basis' => 196833.92,
                            'net_gain_loss' => 1166.08,
                        ],
                        [
                            'term' => 'long',
                            'form8949Box' => 'D',
                            'description' => 'Long-term transactions reported to IRS with basis (Box D)',
                            'proceeds' => 287000.00,
                            'cost_basis' => 277871.76,
                            'net_gain_loss' => 9128.24,
                        ],
                    ],
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]),
        );
    }
}
