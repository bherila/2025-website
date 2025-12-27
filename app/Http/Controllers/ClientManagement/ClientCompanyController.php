<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Models\ClientManagement\ClientCompany;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

class ClientCompanyController extends Controller
{
    /**
     * Display a listing of client companies.
     */
    public function index()
    {
        Gate::authorize('Admin');

        return view('client-management.index');
    }

    /**
     * Show the form for creating a new client company.
     */
    public function create()
    {
        Gate::authorize('Admin');

        return view('client-management.create');
    }

    /**
     * Store a newly created client company in storage.
     */
    public function store(Request $request)
    {
        Gate::authorize('Admin');

        $validated = $request->validate([
            'company_name' => 'required|string|max:255',
        ]);

        // Generate slug from company name
        $slug = ClientCompany::generateSlug($validated['company_name']);

        // Check if slug is unique
        if (ClientCompany::where('slug', $slug)->exists()) {
            if ($request->wantsJson() || $request->ajax()) {
                return response()->json([
                    'errors' => ['slug' => ['A company with a similar name already exists. Please choose a different name.']],
                ], 422);
            }

            return back()->withErrors(['slug' => 'A company with a similar name already exists.'])->withInput();
        }

        $company = ClientCompany::create([
            'company_name' => $validated['company_name'],
            'slug' => $slug,
            'is_active' => true,
            'last_activity' => now(),
        ]);

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json(['redirect' => route('client-management.show', $company->id)], 201);
        }

        return redirect()->route('client-management.show', $company->id);
    }

    /**
     * Display the specified client company.
     */
    public function show($id)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::with('users')->findOrFail($id);

        return view('client-management.show', compact('company'));
    }

    /**
     * Update the specified client company in storage.
     */
    public function update(Request $request, $id)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::findOrFail($id);

        $validated = $request->validate([
            'company_name' => 'required|string|max:255',
            'address' => 'nullable|string',
            'website' => 'nullable|string|max:255',
            'phone_number' => 'nullable|string|max:255',
            'default_hourly_rate' => 'nullable|numeric|min:0',
            'additional_notes' => 'nullable|string',
            'is_active' => 'boolean',
        ]);

        $company->update($validated);
        $company->touchLastActivity();

        if ($request->wantsJson() || $request->ajax()) {
            return response()->json(['success' => true, 'redirect' => route('client-management.show', $company->id)]);
        }

        return redirect()->route('client-management.show', $company->id)
            ->with('success', 'Client company updated successfully.');
    }

    /**
     * Remove the specified client company from storage.
     */
    public function destroy($id)
    {
        Gate::authorize('Admin');

        $company = ClientCompany::findOrFail($id);
        $company->delete();

        return redirect()->route('client-management.index')
            ->with('success', 'Client company deleted successfully.');
    }
}
