<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\View\View;

class PageController extends Controller
{
    public function index(): RedirectResponse
    {
        return redirect('/phr/patients');
    }

    public function patients(): View
    {
        return view('phr.patients');
    }

    public function patientsManage(): View
    {
        return view('phr.patients-manage');
    }

    public function summary(): View
    {
        return view('phr.summary');
    }

    public function labs(): View
    {
        return view('phr.labs');
    }

    public function vitals(): View
    {
        return view('phr.vitals');
    }

    public function imaging(): View
    {
        return view('phr.imaging');
    }

    public function officeVisits(): View
    {
        return view('phr.office-visits');
    }

    public function medications(): View
    {
        return view('phr.medications');
    }

    public function conditions(): View
    {
        return view('phr.conditions');
    }

    public function procedures(): View
    {
        return view('phr.procedures');
    }

    public function immunizations(): View
    {
        return view('phr.immunizations');
    }

    public function allergies(): View
    {
        return view('phr.allergies');
    }

    public function documents(): View
    {
        return view('phr.documents');
    }

    public function access(): View
    {
        return view('phr.access');
    }
}
