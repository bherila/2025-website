<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class ClientCompanyApiController extends Controller
{
    /**
     * Get all client companies with their users.
     */
    public function index()
    {
        Gate::authorize('Admin');
        
        $companies = ClientCompany::with('users')->get();
        
        return response()->json($companies);
    }

    /**
     * Get a single client company by its ID.
     */
    public function show($id)
    {
        Gate::authorize('Admin');
        
        $company = ClientCompany::with('users')->findOrFail($id);
        
        return response()->json($company);
    }

    /**
     * Update a client company.
     */
    public function update(Request $request, $id)
    {
        Gate::authorize('Admin');
        
        $validatedData = $request->validate([
            'company_name' => 'required|string|max:255',
            'slug' => 'nullable|string|max:255',
            'address' => 'nullable|string',
            'website' => 'nullable|url',
            'phone_number' => 'nullable|string|max:255',
            'default_hourly_rate' => 'nullable|numeric|min:0',
            'additional_notes' => 'nullable|string',
            'is_active' => 'required|boolean',
        ]);
        
        $company = ClientCompany::findOrFail($id);
        
        // Validate slug uniqueness if provided and different
        if (isset($validatedData['slug']) && $validatedData['slug'] !== $company->slug) {
            $slug = ClientCompany::generateSlug($validatedData['slug']);
            if (ClientCompany::where('slug', $slug)->where('id', '!=', $id)->exists()) {
                return response()->json([
                    'errors' => ['slug' => ['This slug is already in use by another company.']]
                ], 422);
            }
            $validatedData['slug'] = $slug;
        }
        
        $company->update($validatedData);
        $company->touchLastActivity();
        
        return response()->json([
            'success' => true,
            'message' => 'Company updated successfully',
            'company' => $company->fresh('users'),
        ]);
    }

    /**
     * Get all users for the invite modal.
     */
    public function getUsers()
    {
        Gate::authorize('Admin');
        
        $users = User::select('id', 'name', 'email')->orderBy('name')->get();
        
        return response()->json($users);
    }
}
