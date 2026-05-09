<?php

namespace App\Http\Controllers\ClientManagement;

use App\Http\Controllers\Controller;
use App\Http\Requests\ClientManagement\CreatePaymentMethodSetupIntentRequest;
use App\Http\Requests\ClientManagement\DeleteClientPaymentMethodRequest;
use App\Http\Requests\ClientManagement\SetDefaultClientPaymentMethodRequest;
use App\Models\ClientManagement\ClientCompany;
use App\Models\ClientManagement\ClientCompanyPaymentMethod;
use App\Models\User;
use App\Services\Billing\StripeBillingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

class ClientPaymentMethodApiController extends Controller
{
    public function index(ClientCompany $company, StripeBillingService $billing): JsonResponse
    {
        Gate::authorize('ClientCompanyMember', $company->id);

        return response()->json([
            'payment_methods' => array_map(
                fn (ClientCompanyPaymentMethod $paymentMethod): array => $paymentMethod->toPortalArray(),
                $billing->listSavedMethods($company),
            ),
        ]);
    }

    public function setup(
        CreatePaymentMethodSetupIntentRequest $request,
        ClientCompany $company,
        StripeBillingService $billing,
    ): JsonResponse {
        Gate::authorize('ClientCompanyMember', $company->id);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        return response()->json($billing->createSetupIntent($company, $user));
    }

    public function destroy(
        DeleteClientPaymentMethodRequest $request,
        ClientCompany $company,
        ClientCompanyPaymentMethod $paymentMethod,
        StripeBillingService $billing,
    ): JsonResponse {
        Gate::authorize('ClientCompanyMember', $company->id);
        abort_unless((int) $paymentMethod->client_company_id === (int) $company->id, 404);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $billing->detachPaymentMethod($paymentMethod, $user);

        return response()->json([
            'message' => 'Payment method removed.',
        ]);
    }

    public function makeDefault(
        SetDefaultClientPaymentMethodRequest $request,
        ClientCompany $company,
        ClientCompanyPaymentMethod $paymentMethod,
        StripeBillingService $billing,
    ): JsonResponse {
        Gate::authorize('ClientCompanyMember', $company->id);
        abort_unless((int) $paymentMethod->client_company_id === (int) $company->id, 404);

        $user = $request->user();
        abort_unless($user instanceof User, 401);

        $updated = $billing->setDefaultPaymentMethod($paymentMethod, $user);

        return response()->json([
            'payment_method' => $updated->fresh()?->toPortalArray() ?? $updated->toPortalArray(),
        ]);
    }
}
