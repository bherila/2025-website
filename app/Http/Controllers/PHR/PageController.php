<?php

namespace App\Http\Controllers\PHR;

use App\Http\Controllers\Controller;
use App\Http\Controllers\PHR\Concerns\ResolvesPHRPatientAccess;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PageController extends Controller
{
    use ResolvesPHRPatientAccess;

    private const TAB_LABELS = [
        'summary' => 'Summary',
        'labs' => 'Labs',
        'vitals' => 'Vitals',
        'imaging' => 'Imaging',
        'office-visits' => 'Office Visits',
        'medications' => 'Medications',
        'conditions' => 'Conditions',
        'procedures' => 'Procedures',
        'immunizations' => 'Immunizations',
        'allergies' => 'Allergies',
        'documents' => 'Documents',
        'access' => 'Access',
    ];

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

    public function patientTab(Request $request, int $patient, string $tab): View
    {
        $user = $request->user();
        abort_unless($user !== null, 403);
        $userId = (int) $user->id;
        $resolvedPatient = $this->accessiblePatient($patient, $userId);
        $tabLabel = self::TAB_LABELS[$tab] ?? 'PHR';

        return view('phr.patient-tab', [
            'patientId' => $resolvedPatient->id,
            'tab' => $tab,
            'tabLabel' => $tabLabel,
            'canManage' => $this->canManagePatient($resolvedPatient, $userId),
        ]);
    }
}
