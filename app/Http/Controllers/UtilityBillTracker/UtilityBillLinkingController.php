<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\Http\Controllers\Controller;
use App\Models\FinanceTool\FinAccountLineItems;
use App\Models\User;
use App\Models\UtilityBillTracker\UtilityAccount;
use App\Models\UtilityBillTracker\UtilityBill;
use App\Support\Access\FeatureAccess;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class UtilityBillLinkingController extends Controller
{
    public function __construct(private readonly FeatureAccess $featureAccess) {}

    /**
     * Find potential transactions to link to a utility bill.
     * Searches for transactions within 90 days after the bill end date
     * that are within 10% of the total cost.
     */
    public function findLinkableTransactions(int $accountId, int $billId)
    {
        $uid = Auth::id();

        // Verify account and bill belong to user
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        $billEndDate = $bill->bill_end_date->format('Y-m-d');
        $totalCost = abs(floatval($bill->total_cost));

        // Calculate date range (bill end date to 90 days after)
        $startDate = $billEndDate;
        $endDate = $bill->bill_end_date->copy()->addDays(90)->format('Y-m-d');

        // Calculate amount range (+/- 10% to account for transaction fees)
        $minAmount = $totalCost * 0.90;
        $maxAmount = $totalCost * 1.10;

        // Find matching transactions across all user's accounts
        $potentialMatches = FinAccountLineItems::whereHas('account', function ($query) use ($uid) {
            $query->where('acct_owner', $uid);
        })
            ->with('account:acct_id,acct_name')
            ->whereBetween('t_date', [$startDate, $endDate])
            ->where(function ($query) use ($minAmount, $maxAmount) {
                // Match on absolute amount within range (bills are typically debits/negative)
                $query->whereRaw('ABS(t_amt) BETWEEN ? AND ?', [$minAmount, $maxAmount]);
            })
            ->where(function ($query) {
                // Exclude transactions with stock symbols as they aren't utility payments
                $query->whereNull('t_symbol')->orWhere('t_symbol', '');
            })
            ->orderByRaw('ABS(ABS(t_amt) - ?)', [$totalCost]) // Order by closest amount match
            ->orderBy('t_date', 'asc')
            ->limit(50)
            ->get(['t_id', 't_account', 't_date', 't_description', 't_amt', 't_type']);

        // Users without finance.transactions.view may link bills but must not
        // see the underlying transaction descriptions/amounts; redact those
        // fields while keeping enough metadata to pick a candidate.
        $user = Auth::user();
        $canReadTransactions = $user instanceof User
            && $this->featureAccess->can($user, 'finance.transactions.view');

        // Add account name to each match
        $potentialMatches = $potentialMatches->map(
            fn (FinAccountLineItems $item): array => $this->mapLinkableTransaction($item, $canReadTransactions)
        );

        return response()->json([
            'bill' => [
                'id' => $bill->id,
                'bill_end_date' => $bill->bill_end_date,
                'total_cost' => $bill->total_cost,
                'due_date' => $bill->due_date,
            ],
            'potential_matches' => $potentialMatches,
            'current_link' => $bill->t_id,
        ]);
    }

    /**
     * Shape a candidate transaction for the linker UI, redacting the
     * description/amount/type for users without finance.transactions.view.
     *
     * @return array<string, mixed>
     */
    public function mapLinkableTransaction(FinAccountLineItems $item, bool $canReadTransactions): array
    {
        return [
            't_id' => $item->t_id,
            't_account' => $item->t_account,
            'acct_name' => $item->account?->acct_name,
            't_date' => $item->t_date,
            't_description' => $canReadTransactions ? $item->t_description : null,
            't_amt' => $canReadTransactions ? $item->t_amt : null,
            't_type' => $canReadTransactions ? $item->t_type : null,
        ];
    }

    /**
     * Link a utility bill to a finance transaction.
     */
    public function linkTransaction(Request $request, int $accountId, int $billId)
    {
        $uid = Auth::id();

        $request->validate([
            't_id' => 'required|integer',
        ]);

        // Verify account and bill belong to user
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        // Verify the transaction belongs to the user
        $transaction = FinAccountLineItems::where('t_id', $request->t_id)
            ->whereHas('account', function ($query) use ($uid) {
                $query->where('acct_owner', $uid);
            })
            ->firstOrFail();

        // Update the bill with the link
        $bill->update(['t_id' => $transaction->t_id]);

        return response()->json([
            'success' => true,
            'message' => 'Bill linked to transaction successfully',
            'bill' => $bill->fresh()->load('linkedTransaction:t_id,t_description,t_amt,t_date'),
        ]);
    }

    /**
     * Unlink a utility bill from its finance transaction.
     */
    public function unlinkTransaction(int $accountId, int $billId)
    {
        // Verify account and bill belong to user
        UtilityAccount::findOrFail($accountId);

        $bill = UtilityBill::where('utility_account_id', $accountId)
            ->where('id', $billId)
            ->firstOrFail();

        if (! $bill->t_id) {
            return response()->json(['error' => 'Bill is not linked to any transaction'], 400);
        }

        $bill->update(['t_id' => null]);

        return response()->json([
            'success' => true,
            'message' => 'Bill unlinked from transaction',
            'bill' => $bill->fresh(),
        ]);
    }
}
