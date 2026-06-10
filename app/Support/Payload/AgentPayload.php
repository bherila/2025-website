<?php

namespace App\Support\Payload;

use HelgeSverre\Toon\DecodeOptions;
use HelgeSverre\Toon\Exceptions\DecodeException;
use HelgeSverre\Toon\Toon;
use Illuminate\Http\Request;

/**
 * Thin wrapper around the helgesverre/toon codec for the agent API's
 * JSON/TOON content negotiation. Never parse TOON by hand — always go
 * through this class (which delegates to the package).
 */
final class AgentPayload
{
    public const TOON_MEDIA_TYPE = 'text/toon';

    public const TOON_CONTENT_TYPE = 'text/toon; charset=utf-8';

    public static function encode(mixed $data): string
    {
        return Toon::encode($data);
    }

    /**
     * @throws DecodeException
     */
    public static function decode(string $raw): mixed
    {
        return Toon::decode($raw, DecodeOptions::lenient());
    }

    public static function isToonMediaType(?string $contentType): bool
    {
        return $contentType !== null && str_starts_with(strtolower(ltrim($contentType)), self::TOON_MEDIA_TYPE);
    }

    public static function isJsonMediaType(?string $contentType): bool
    {
        if ($contentType === null || trim($contentType) === '') {
            return false;
        }

        $normalized = strtolower(ltrim($contentType));

        return str_starts_with($normalized, 'application/json')
            || str_contains(strtok($normalized, ';') ?: '', '+json');
    }

    /**
     * Whether the response should be TOON-encoded. `?format=json` forces
     * JSON, `?format=toon` forces TOON, otherwise `Accept: text/toon` opts in.
     */
    public static function wantsToon(Request $request): bool
    {
        $format = $request->query('format');

        if ($format === 'json') {
            return false;
        }

        if ($format === 'toon') {
            return true;
        }

        return str_contains((string) $request->header('Accept', ''), self::TOON_MEDIA_TYPE);
    }
}
