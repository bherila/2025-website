<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Services\PHR\Access\PhrPatientAccessService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PageController extends Controller
{
    public function __construct(private PhrPatientAccessService $accessService) {}

    public function index(): RedirectResponse
    {
        return redirect('/phr/patients');
    }

    public function patients(): View
    {
        return view('phr.patients');
    }

    public function managePatients(): View
    {
        return view('phr.manage');
    }

    public function imports(): View
    {
        return view('phr.imports');
    }

    public function config(): View
    {
        return view('phr.config');
    }

    public function patient(Request $request, int $patient): View
    {
        $user = $request->user();
        abort_unless($user !== null, 403);
        $userId = (int) $user->id;
        $resolvedPatient = $this->accessService->accessiblePatient($patient, $userId);

        return view('phr.patient', [
            'patientId' => $resolvedPatient->id,
            'canManage' => $this->accessService->canWrite($resolvedPatient, $userId),
        ]);
    }
}
