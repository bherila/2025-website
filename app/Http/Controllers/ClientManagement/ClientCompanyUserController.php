<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ClientCompanyUserController extends Controller
{
    /**
     * Attach a user to a client company.
     */
    public function store(Request $request)
    {
        Gate::authorize('Admin');
        
        $validated = $request->validate([
            'client_company_id' => 'required|exists:client_companies,id',
            'user_id' => 'required|exists:users,id',
        ]);

        $company = ClientCompany::findOrFail($validated['client_company_id']);
        
        // Attach user if not already attached
        if (!$company->users()->where('user_id', $validated['user_id'])->exists()) {
            $company->users()->attach($validated['user_id']);
        }

        return response()->json([
            'success' => true,
            'message' => 'User added to client company successfully.',
        ]);
    }

    /**
     * Remove a user from a client company.
     */
    public function destroy($companyId, $userId)
    {
        Gate::authorize('Admin');
        
        $company = ClientCompany::findOrFail($companyId);
        $company->users()->detach($userId);

        return response()->json([
            'success' => true,
            'message' => 'User removed from client company successfully.',
        ]);
    }
}
