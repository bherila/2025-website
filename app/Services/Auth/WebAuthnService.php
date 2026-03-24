<?php

namespace App\Services\Auth;

use App\Models\LoginAuditLog;
use App\Models\User;
use App\Models\WebAuthnCredential;
use Cose\Algorithm\Signature\ECDSA\ES256;
use Cose\Algorithm\Signature\RSA\RS256;
use Illuminate\Http\Request;
use Symfony\Component\Serializer\SerializerInterface;
use Symfony\Component\Uid\Uuid;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AttestationStatement\NoneAttestationStatementSupport;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialDescriptor;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialSource;
use Webauthn\PublicKeyCredentialUserEntity;
use Webauthn\TrustPath\EmptyTrustPath;

class WebAuthnService
{
    private const SESSION_REGISTER_OPTIONS = 'webauthn_register_options';

    private const SESSION_LOGIN_OPTIONS = 'webauthn_login_options';

    private const DEFAULT_APP_URL = 'https://localhost';

    /**
     * Generate registration options for a user.
     */
    public function generateRegistrationOptions(User $user, Request $request): array
    {
        $rpId = $this->getRpId($request);
        $rpEntity = PublicKeyCredentialRpEntity::create(config('app.name', 'App'), $rpId);
        $userEntity = PublicKeyCredentialUserEntity::create(
            $user->name,
            (string) $user->id,
            $user->email,
        );

        // Exclude existing credentials to avoid duplicates
        $excludeCredentials = WebAuthnCredential::where('user_id', $user->id)
            ->get()
            ->map(fn ($cred) => PublicKeyCredentialDescriptor::create(
                'public-key',
                base64_decode(strtr($cred->credential_id, '-_', '+/')),
            ))
            ->toArray();

        $challenge = random_bytes(32);

        $options = PublicKeyCredentialCreationOptions::create(
            rp: $rpEntity,
            user: $userEntity,
            challenge: $challenge,
            pubKeyCredParams: [
                PublicKeyCredentialParameters::create('public-key', ES256::ID),
                PublicKeyCredentialParameters::create('public-key', RS256::ID),
            ],
            excludeCredentials: $excludeCredentials,
            timeout: 60000,
        );

        // Store in session for verification
        $request->session()->put(self::SESSION_REGISTER_OPTIONS, serialize($options));

        return $this->optionsToArray($options);
    }

    /**
     * Verify the registration response and store credential.
     */
    public function verifyRegistrationResponse(User $user, Request $request, array $credentialData, string $name): WebAuthnCredential
    {
        $serializedOptions = $request->session()->get(self::SESSION_REGISTER_OPTIONS);
        if (! $serializedOptions) {
            throw new \RuntimeException('No pending registration options found.');
        }

        $options = unserialize($serializedOptions);
        $request->session()->forget(self::SESSION_REGISTER_OPTIONS);

        $serializer = $this->createSerializer();
        $credential = $serializer->deserialize(
            json_encode($credentialData),
            PublicKeyCredential::class,
            'json'
        );

        /** @var AuthenticatorAttestationResponse $response */
        $response = $credential->response;

        $host = $this->getRpId($request);
        $validator = $this->createAttestationValidator($request);
        $source = $validator->check($response, $options, $host);

        // Store credential
        return WebAuthnCredential::create([
            'user_id' => $user->id,
            'credential_id' => $this->encodeCredentialId($source->publicKeyCredentialId),
            'public_key' => base64_encode($source->credentialPublicKey),
            'counter' => $source->counter,
            'aaguid' => $source->aaguid->toRfc4122(),
            'name' => $name ?: 'Passkey',
            'transports' => $source->transports,
        ]);
    }

    /**
     * Generate authentication options.
     *
     * @param  User|null  $user  If provided, only return that user's credentials.
     */
    public function generateAuthenticationOptions(?User $user, Request $request): array
    {
        $rpId = $this->getRpId($request);

        $allowCredentials = [];
        if ($user) {
            $allowCredentials = WebAuthnCredential::where('user_id', $user->id)
                ->get()
                ->map(fn ($cred) => PublicKeyCredentialDescriptor::create(
                    'public-key',
                    base64_decode(strtr($cred->credential_id, '-_', '+/')),
                ))
                ->toArray();
        }

        $challenge = random_bytes(32);

        $options = PublicKeyCredentialRequestOptions::create(
            challenge: $challenge,
            rpId: $rpId,
            allowCredentials: $allowCredentials,
            userVerification: PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_PREFERRED,
            timeout: 60000,
        );

        $request->session()->put(self::SESSION_LOGIN_OPTIONS, serialize($options));

        return $this->requestOptionsToArray($options);
    }

    /**
     * Verify authentication response and return the authenticated user.
     */
    public function verifyAuthenticationResponse(Request $request, array $credentialData): User
    {
        $serializedOptions = $request->session()->get(self::SESSION_LOGIN_OPTIONS);
        if (! $serializedOptions) {
            throw new \RuntimeException('No pending authentication options found.');
        }

        $options = unserialize($serializedOptions);
        $request->session()->forget(self::SESSION_LOGIN_OPTIONS);

        $serializer = $this->createSerializer();
        $credential = $serializer->deserialize(
            json_encode($credentialData),
            PublicKeyCredential::class,
            'json'
        );

        $rawId = $credential->rawId;
        $encodedId = $this->encodeCredentialId($rawId);

        // Find the credential - try both the exact ID and URL-safe base64 variants
        $storedCredential = WebAuthnCredential::where('credential_id', $encodedId)->first();

        if (! $storedCredential) {
            throw new \RuntimeException('Credential not found.');
        }

        $user = $storedCredential->user;
        if (! $user || ! $user->canLogin()) {
            throw new \RuntimeException('User account is disabled.');
        }

        // Reconstruct the source
        $source = $this->credentialToSource($storedCredential, $user);

        /** @var AuthenticatorAssertionResponse $response */
        $response = $credential->response;

        $host = $this->getRpId($request);
        $validator = $this->createAssertionValidator($request);
        $updatedSource = $validator->check(
            $source,
            $response,
            $options,
            $host,
            (string) $user->id
        );

        // Update counter
        $storedCredential->update(['counter' => $updatedSource->counter]);

        return $user;
    }

    private function getRpId(Request $request): string
    {
        // Always use the request's actual host so that the RP ID always matches
        // the effective domain of the origin. Using APP_URL caused a mismatch when
        // APP_URL contained "www." but the user accessed the site without it (or
        // vice-versa), which made the browser throw a silent SecurityError.
        return $request->getHost();
    }

    private function encodeCredentialId(string $rawId): string
    {
        return rtrim(strtr(base64_encode($rawId), '+/', '-_'), '=');
    }

    private function createSerializer(): SerializerInterface
    {
        $attestationManager = new AttestationStatementSupportManager([
            new NoneAttestationStatementSupport,
        ]);

        return (new WebauthnSerializerFactory($attestationManager))->create();
    }

    private function createAttestationValidator(Request $request): AuthenticatorAttestationResponseValidator
    {
        $factory = new CeremonyStepManagerFactory;
        $allowedOrigins = [$request->getSchemeAndHttpHost()];

        $appUrl = config('app.url');
        if ($appUrl && ! str_contains($appUrl, 'localhost')) {
            $allowedOrigins[] = $appUrl;
        }

        $factory->setAllowedOrigins($allowedOrigins);

        return AuthenticatorAttestationResponseValidator::create($factory->creationCeremony());
    }

    private function createAssertionValidator(Request $request): AuthenticatorAssertionResponseValidator
    {
        $factory = new CeremonyStepManagerFactory;
        $allowedOrigins = [$request->getSchemeAndHttpHost()];

        $appUrl = config('app.url');
        if ($appUrl && ! str_contains($appUrl, 'localhost')) {
            $allowedOrigins[] = $appUrl;
        }

        $factory->setAllowedOrigins($allowedOrigins);

        return AuthenticatorAssertionResponseValidator::create($factory->requestCeremony());
    }

    private function credentialToSource(WebAuthnCredential $credential, User $user): PublicKeyCredentialSource
    {
        $rawId = base64_decode(strtr($credential->credential_id, '-_', '+/'));

        return PublicKeyCredentialSource::create(
            publicKeyCredentialId: $rawId,
            type: 'public-key',
            transports: $credential->transports ?? [],
            attestationType: 'none',
            trustPath: new EmptyTrustPath,
            aaguid: $credential->aaguid
                ? Uuid::fromString($credential->aaguid)
                : Uuid::fromString('00000000-0000-0000-0000-000000000000'),
            credentialPublicKey: base64_decode($credential->public_key),
            userHandle: (string) $user->id,
            counter: $credential->counter,
        );
    }

    private function optionsToArray(PublicKeyCredentialCreationOptions $options): array
    {
        return [
            'challenge' => $this->encodeCredentialId($options->challenge),
            'rp' => [
                'name' => $options->rp->name,
                'id' => $options->rp->id,
            ],
            'user' => [
                'id' => $this->encodeCredentialId($options->user->id),
                'name' => $options->user->name,
                'displayName' => $options->user->displayName,
            ],
            'pubKeyCredParams' => array_map(fn ($p) => [
                'type' => $p->type,
                'alg' => $p->alg,
            ], $options->pubKeyCredParams),
            'timeout' => $options->timeout,
            'excludeCredentials' => array_map(fn ($c) => [
                'type' => $c->type,
                'id' => $this->encodeCredentialId($c->id),
            ], $options->excludeCredentials),
            'authenticatorSelection' => [
                'residentKey' => 'preferred',
                'requireResidentKey' => false,
                'userVerification' => 'preferred',
            ],
            'attestation' => 'none',
        ];
    }

    private function requestOptionsToArray(PublicKeyCredentialRequestOptions $options): array
    {
        return [
            'challenge' => $this->encodeCredentialId($options->challenge),
            'rpId' => $options->rpId,
            'allowCredentials' => array_map(fn ($c) => [
                'type' => $c->type,
                'id' => $this->encodeCredentialId($c->id),
            ], $options->allowCredentials),
            'userVerification' => $options->userVerification ?? 'preferred',
            'timeout' => $options->timeout,
        ];
    }

    /**
     * Log a login attempt to the audit log.
     */
    public function logAuditEvent(Request $request, ?User $user, string $email, bool $success, string $method = 'password'): void
    {
        LoginAuditLog::create([
            'user_id' => $user?->id,
            'email' => $email,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'success' => $success,
            'method' => $method,
        ]);
    }
}
