<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientExpense;
use App\Models\FinAccountLineItems;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;

class ClientExpenseApiController extends Controller
{
    /**
     * List all expenses for a company.
     */
    public function index(ClientCompany $company)
    {
        Gate::authorize('Admin');

        $expenses = ClientExpense::where('client_company_id', $company->id)
            ->with(['project:id,name,slug', 'creator:id,name', 'finLineItem'])
            ->orderBy('expense_date', 'desc')
            ->get()
            ->map(function ($expense) {
                $data = $expense->toArray();
                // Add account name to finLineItem if present
                if ($expense->finLineItem) {
                    $data['fin_line_item']['account_name'] = $expense->finLineItem->account?->acct_name;
                }
                return $data;
            });

        $totalAmount = $expenses->sum('amount');
        $reimbursableTotal = $expenses->where('is_reimbursable', true)->sum('amount');
        $nonReimbursableTotal = $expenses->where('is_reimbursable', false)->sum('amount');
        $pendingReimbursementTotal = $expenses
            ->where('is_reimbursable', true)
            ->where('is_reimbursed', false)
            ->sum('amount');

        return response()->json([
            'expenses' => $expenses,
            'total_amount' => (float) $totalAmount,
            'reimbursable_total' => (float) $reimbursableTotal,
            'non_reimbursable_total' => (float) $nonReimbursableTotal,
            'pending_reimbursement_total' => (float) $pendingReimbursementTotal,
        ]);
    }

    /**
     * Store a new expense.
     */
    public function store(Request $request, ClientCompany $company)
    {
        Gate::authorize('Admin');

        $validated = $request->validate([
            'description' => 'required|string|max:255',
            'amount' => 'required|numeric|min:0',
            'expense_date' => 'required|date',
            'project_id' => 'nullable|exists:client_projects,id',
            'fin_line_item_id' => 'nullable|integer',
            'is_reimbursable' => 'boolean',
            'is_reimbursed' => 'boolean',
            'reimbursed_date' => 'nullable|date',
            'category' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
        ]);

        // Verify fin_line_item_id exists if provided
        if (!empty($validated['fin_line_item_id'])) {
            $finLineItem = FinAccountLineItems::find($validated['fin_line_item_id']);
            if (!$finLineItem) {
                return response()->json(['error' => 'Finance line item not found'], 404);
            }
        }

        $expense = ClientExpense::create([
            'client_company_id' => $company->id,
            'description' => $validated['description'],
            'amount' => $validated['amount'],
            'expense_date' => $validated['expense_date'],
            'project_id' => $validated['project_id'] ?? null,
            'fin_line_item_id' => $validated['fin_line_item_id'] ?? null,
            'is_reimbursable' => $validated['is_reimbursable'] ?? false,
            'is_reimbursed' => $validated['is_reimbursed'] ?? false,
            'reimbursed_date' => $validated['reimbursed_date'] ?? null,
            'category' => $validated['category'] ?? null,
            'notes' => $validated['notes'] ?? null,
            'creator_user_id' => Auth::id(),
        ]);

        $expense->load(['project:id,name,slug', 'creator:id,name', 'finLineItem']);
        
        if ($expense->finLineItem) {
            $expense->fin_line_item['account_name'] = $expense->finLineItem->account?->acct_name;
        }

        return response()->json($expense, 201);
    }

    /**
     * Show a single expense.
     */
    public function show(ClientCompany $company, ClientExpense $expense)
    {
        Gate::authorize('Admin');

        if ($expense->client_company_id !== $company->id) {
            return response()->json(['error' => 'Expense does not belong to this company'], 404);
        }

        $expense->load(['project:id,name,slug', 'creator:id,name', 'finLineItem']);
        
        $data = $expense->toArray();
        if ($expense->finLineItem) {
            $data['fin_line_item']['account_name'] = $expense->finLineItem->account?->acct_name;
        }

        return response()->json($data);
    }

    /**
     * Update an expense.
     */
    public function update(Request $request, ClientCompany $company, ClientExpense $expense)
    {
        Gate::authorize('Admin');

        if ($expense->client_company_id !== $company->id) {
            return response()->json(['error' => 'Expense does not belong to this company'], 404);
        }

        $validated = $request->validate([
            'description' => 'sometimes|required|string|max:255',
            'amount' => 'sometimes|required|numeric|min:0',
            'expense_date' => 'sometimes|required|date',
            'project_id' => 'nullable|exists:client_projects,id',
            'fin_line_item_id' => 'nullable|integer',
            'is_reimbursable' => 'boolean',
            'is_reimbursed' => 'boolean',
            'reimbursed_date' => 'nullable|date',
            'category' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
        ]);

        // Verify fin_line_item_id exists if provided
        if (isset($validated['fin_line_item_id']) && $validated['fin_line_item_id'] !== null) {
            $finLineItem = FinAccountLineItems::find($validated['fin_line_item_id']);
            if (!$finLineItem) {
                return response()->json(['error' => 'Finance line item not found'], 404);
            }
        }

        $expense->update($validated);

        $expense->load(['project:id,name,slug', 'creator:id,name', 'finLineItem']);
        
        $data = $expense->toArray();
        if ($expense->finLineItem) {
            $data['fin_line_item']['account_name'] = $expense->finLineItem->account?->acct_name;
        }

        return response()->json($data);
    }

    /**
     * Delete an expense.
     */
    public function destroy(ClientCompany $company, ClientExpense $expense)
    {
        Gate::authorize('Admin');

        if ($expense->client_company_id !== $company->id) {
            return response()->json(['error' => 'Expense does not belong to this company'], 404);
        }

        $expense->delete();

        return response()->json(['message' => 'Expense deleted successfully']);
    }

    /**
     * Mark an expense as reimbursed.
     */
    public function markReimbursed(Request $request, ClientCompany $company, ClientExpense $expense)
    {
        Gate::authorize('Admin');

        if ($expense->client_company_id !== $company->id) {
            return response()->json(['error' => 'Expense does not belong to this company'], 404);
        }

        if (!$expense->is_reimbursable) {
            return response()->json(['error' => 'This expense is not marked as reimbursable'], 400);
        }

        $validated = $request->validate([
            'reimbursed_date' => 'nullable|date',
        ]);

        $expense->update([
            'is_reimbursed' => true,
            'reimbursed_date' => $validated['reimbursed_date'] ?? now()->toDateString(),
        ]);

        return response()->json(['message' => 'Expense marked as reimbursed']);
    }

    /**
     * Link an expense to a finance line item.
     */
    public function linkToFinanceLineItem(Request $request, ClientCompany $company, ClientExpense $expense)
    {
        Gate::authorize('Admin');

        if ($expense->client_company_id !== $company->id) {
            return response()->json(['error' => 'Expense does not belong to this company'], 404);
        }

        $validated = $request->validate([
            'fin_line_item_id' => 'required|integer',
        ]);

        $finLineItem = FinAccountLineItems::find($validated['fin_line_item_id']);
        if (!$finLineItem) {
            return response()->json(['error' => 'Finance line item not found'], 404);
        }

        $expense->update(['fin_line_item_id' => $validated['fin_line_item_id']]);

        return response()->json(['message' => 'Expense linked to finance line item']);
    }

    /**
     * Unlink an expense from a finance line item.
     */
    public function unlinkFromFinanceLineItem(ClientCompany $company, ClientExpense $expense)
    {
        Gate::authorize('Admin');

        if ($expense->client_company_id !== $company->id) {
            return response()->json(['error' => 'Expense does not belong to this company'], 404);
        }

        $expense->update(['fin_line_item_id' => null]);

        return response()->json(['message' => 'Expense unlinked from finance line item']);
    }
}
