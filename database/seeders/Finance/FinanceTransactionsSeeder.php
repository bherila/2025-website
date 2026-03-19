<?php

namespace Database\Seeders\Finance;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class FinanceTransactionsSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::query()->where('email', 'test@example.com')->first();

        if (! $user) {
            return;
        }

        $accounts = DB::table('fin_accounts')
            ->where('acct_owner', $user->id)
            ->whereIn('acct_name', ['Demo Checking', 'Demo Savings', 'Demo Brokerage'])
            ->pluck('acct_id', 'acct_name');

        $checkingId = (int) ($accounts['Demo Checking'] ?? 0);
        $savingsId = (int) ($accounts['Demo Savings'] ?? 0);
        $brokerageId = (int) ($accounts['Demo Brokerage'] ?? 0);

        if ($checkingId === 0 || $savingsId === 0 || $brokerageId === 0) {
            return;
        }

        $rows = [
            // Checking account (including W-2 direct deposits and consulting income)
            ['t_account' => $checkingId, 't_date' => '2026-01-15', 't_type' => 'deposit', 't_amt' => 4200.00, 't_description' => 'DIRECT DEPOSIT - ACME SOFTWARE PAYROLL', 't_comment' => 'W-2 paycheck', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $checkingId, 't_date' => '2026-01-31', 't_type' => 'deposit', 't_amt' => 4200.00, 't_description' => 'DIRECT DEPOSIT - ACME SOFTWARE PAYROLL', 't_comment' => 'W-2 paycheck', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $checkingId, 't_date' => '2026-01-02', 't_type' => 'payment', 't_amt' => -2450.00, 't_description' => 'ACH PAYMENT - MONTHLY RENT', 't_comment' => 'Housing', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $checkingId, 't_date' => '2026-01-10', 't_type' => 'payment', 't_amt' => -167.42, 't_description' => 'PG&E UTILITY BILL', 't_comment' => 'Utilities', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $checkingId, 't_date' => '2026-01-22', 't_type' => 'deposit', 't_amt' => 1850.00, 't_description' => 'ACH CREDIT - BLUE HARBOR CONSULTING CLIENT PAYMENT', 't_comment' => 'Schedule C income', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $checkingId, 't_date' => '2026-02-07', 't_type' => 'payment', 't_amt' => -238.77, 't_description' => 'OFFICE DEPOT - MONITORS AND CABLES', 't_comment' => 'Business office expense', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $checkingId, 't_date' => '2026-02-09', 't_type' => 'payment', 't_amt' => -142.51, 't_description' => 'SAFEWAY #1234', 't_comment' => 'Groceries', 't_source' => 'demo-seeder', 't_origin' => 'manual'],

            // Savings account
            ['t_account' => $savingsId, 't_date' => '2026-01-03', 't_type' => 'transfer', 't_amt' => 1500.00, 't_description' => 'TRANSFER FROM DEMO CHECKING', 't_comment' => 'Monthly savings contribution', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $savingsId, 't_date' => '2026-01-31', 't_type' => 'interest', 't_amt' => 22.84, 't_description' => 'INTEREST PAYMENT', 't_comment' => 'Monthly APY payout', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $savingsId, 't_date' => '2026-02-18', 't_type' => 'withdrawal', 't_amt' => -400.00, 't_description' => 'TRANSFER TO DEMO CHECKING - EMERGENCY CAR REPAIR', 't_comment' => 'Unexpected expense', 't_source' => 'demo-seeder', 't_origin' => 'manual'],

            // Brokerage account - stock + options + wash-sale/non-wash-sale coverage
            ['t_account' => $brokerageId, 't_date' => '2025-12-01', 't_type' => 'trade', 't_amt' => -6000.00, 't_symbol' => 'AAPL', 't_qty' => 30, 't_price' => 200.00, 't_commission' => 0, 't_fee' => 0, 't_method' => 'BUY', 't_description' => 'BUY 30 AAPL @ 200.00', 't_comment' => 'Long-term core position', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $brokerageId, 't_date' => '2026-02-12', 't_type' => 'trade', 't_amt' => 6450.00, 't_symbol' => 'AAPL', 't_qty' => -30, 't_price' => 215.00, 't_commission' => 0, 't_fee' => 0, 't_method' => 'SELL', 't_description' => 'SELL 30 AAPL @ 215.00', 't_comment' => 'Realized gain (non-wash sale)', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $brokerageId, 't_date' => '2026-01-05', 't_type' => 'trade', 't_amt' => -5000.00, 't_symbol' => 'TSLA', 't_qty' => 20, 't_price' => 250.00, 't_commission' => 0, 't_fee' => 0, 't_method' => 'BUY', 't_description' => 'BUY 20 TSLA @ 250.00', 't_comment' => 'Potential wash-sale lot A', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $brokerageId, 't_date' => '2026-01-20', 't_type' => 'trade', 't_amt' => 4400.00, 't_symbol' => 'TSLA', 't_qty' => -20, 't_price' => 220.00, 't_commission' => 0, 't_fee' => 0, 't_method' => 'SELL', 't_description' => 'SELL 20 TSLA @ 220.00', 't_comment' => 'Realized loss candidate', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $brokerageId, 't_date' => '2026-01-27', 't_type' => 'trade', 't_amt' => -4300.00, 't_symbol' => 'TSLA', 't_qty' => 20, 't_price' => 215.00, 't_commission' => 0, 't_fee' => 0, 't_method' => 'BUY', 't_description' => 'BUY 20 TSLA @ 215.00', 't_comment' => 'Replacement lot (wash-sale window)', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $brokerageId, 't_date' => '2026-02-03', 't_type' => 'option', 't_amt' => -450.00, 't_symbol' => 'MSFT', 't_qty' => 1, 't_price' => 4.50, 't_commission' => 0, 't_fee' => 0.65, 't_method' => 'BUY TO OPEN', 'opt_expiration' => '2026-04-17', 'opt_type' => 'call', 'opt_strike' => 430.00, 't_description' => 'BTO MSFT 2026-04-17 430 C', 't_comment' => 'Bullish swing trade', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
            ['t_account' => $brokerageId, 't_date' => '2026-02-14', 't_type' => 'option', 't_amt' => 620.00, 't_symbol' => 'MSFT', 't_qty' => -1, 't_price' => 6.20, 't_commission' => 0, 't_fee' => 0.65, 't_method' => 'SELL TO CLOSE', 'opt_expiration' => '2026-04-17', 'opt_type' => 'call', 'opt_strike' => 430.00, 't_description' => 'STC MSFT 2026-04-17 430 C', 't_comment' => 'Option profit', 't_source' => 'demo-seeder', 't_origin' => 'manual'],
        ];

        foreach ($rows as $row) {
            DB::table('fin_account_line_items')->updateOrInsert(
                [
                    't_account' => $row['t_account'],
                    't_date' => $row['t_date'],
                    't_description' => $row['t_description'],
                    't_amt' => $row['t_amt'],
                ],
                $row,
            );
        }
    }
}
