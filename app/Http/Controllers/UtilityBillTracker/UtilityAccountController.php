<?php

namespace App\Http\Controllers\UtilityBillTracker;

use App\Http\Controllers\Controller;
use App\Models\UtilityBillTracker\UtilityAccount;

class UtilityAccountController extends Controller
{
    /**
     * Display the utility accounts list page.
     */
    public function index()
    {
        return view('utility-bill-tracker.accounts');
    }

    /**
     * Display the bills for a specific utility account.
     */
    public function bills(int $id)
    {
        $account = UtilityAccount::findOrFail($id);
        
        return view('utility-bill-tracker.bills', [
            'account_id' => $account->id,
            'account_name' => $account->account_name,
            'account_type' => $account->account_type,
        ]);
    }
}
