<?php

namespace App\Http\Controllers;

use App\Models\WebAuthnCredential;
use App\Services\Auth\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PasskeyController extends Controller
{
    public function __construct(private readonly WebAuthnService $webAuthnService) {}

    /**
     * List the authenticated user's passkeys.
     */
    public function index(): JsonResponse
    {
        $passkeys = WebAuthnCredential::where('user_id', Auth::id())
            ->orderBy('created_at', 'desc')
            ->get(['id', 'name', 'aaguid', 'created_at', 'updated_at']);

        return response()->json($passkeys);
    }

    /**
     * Generate registration options (step 1 of passkey registration).
     */
    public function registrationOptions(Request $request): JsonResponse
    {
        $user = Auth::user();
        $options = $this->webAuthnService->generateRegistrationOptions($user, $request);

        return response()->json($options);
    }

    /**
     * Verify registration response and store the new passkey (step 2).
     */
    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'credential' => 'required|array',
            'name' => 'nullable|string|max:255',
        ]);

        $user = Auth::user();

        try {
            $credential = $this->webAuthnService->verifyRegistrationResponse(
                $user,
                $request,
                $request->input('credential'),
                $request->input('name', 'Passkey')
            );

            return response()->json([
                'success' => true,
                'passkey' => [
                    'id' => $credential->id,
                    'name' => $credential->name,
                    'created_at' => $credential->created_at,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json(['error' => 'Registration failed: '.$e->getMessage()], 422);
        }
    }

    /**
     * Delete a passkey.
     */
    public function destroy(int $id): JsonResponse
    {
        $credential = WebAuthnCredential::where('id', $id)
            ->where('user_id', Auth::id())
            ->firstOrFail();

        $credential->delete();

        return response()->json(['success' => true]);
    }

    /**
     * Generate authentication options (step 1 of passkey login).
     */
    public function authOptions(Request $request): JsonResponse
    {
        $options = $this->webAuthnService->generateAuthenticationOptions(null, $request);

        return response()->json($options);
    }

    /**
     * Verify passkey login assertion (step 2 of passkey login).
     */
    public function authenticate(Request $request): JsonResponse
    {
        $request->validate([
            'credential' => 'required|array',
        ]);

        try {
            $user = $this->webAuthnService->verifyAuthenticationResponse(
                $request,
                $request->input('credential')
            );

            Auth::login($user);
            $request->session()->regenerate();

            $this->webAuthnService->logAuditEvent($request, $user, $user->email, true, 'passkey');

            return response()->json(['success' => true, 'redirect' => '/']);
        } catch (\Throwable $e) {
            $this->webAuthnService->logAuditEvent($request, null, '', false, 'passkey');

            return response()->json(['error' => 'Authentication failed: '.$e->getMessage()], 422);
        }
    }
}
