<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Gate;

class UserManagementController extends Controller
{
    /**
     * Show the user management page.
     */
    public function index()
    {
        Gate::authorize('admin');

        return view('admin.users');
    }
}
