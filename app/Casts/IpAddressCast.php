<?php

namespace App\Casts;

use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * Eloquent cast that stores IP addresses as binary (VARBINARY(16) in MySQL, BLOB in SQLite).
 *
 * IPv4 addresses are packed to 4 bytes; IPv6 addresses to 16 bytes.
 * Uses PHP's inet_pton() / inet_ntop() so the same code works on both MySQL and SQLite.
 *
 * @implements CastsAttributes<string, string>
 */
class IpAddressCast implements CastsAttributes
{
    /**
     * Convert the stored binary value back to a human-readable IP string.
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        $result = inet_ntop((string) $value);

        return $result !== false ? $result : null;
    }

    /**
     * Convert a human-readable IP string to its binary representation for storage.
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): mixed
    {
        if ($value === null) {
            return null;
        }

        $result = inet_pton((string) $value);

        return $result !== false ? $result : null;
    }
}
