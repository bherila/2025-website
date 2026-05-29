<?php

namespace App\Casts\ClientManagement;

use App\Enums\ClientManagement\BillingCadence;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;
use ValueError;

/**
 * @implements CastsAttributes<BillingCadence|null, BillingCadence|string|null>
 */
class BillingCadenceCast implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?BillingCadence
    {
        if ($value === null) {
            return null;
        }

        $normalized = self::normalizeCadenceValue((string) $value);
        $cadence = BillingCadence::tryFrom($normalized);

        if ($cadence === null) {
            throw new ValueError(sprintf('"%s" is not a valid backing value for enum %s', $value, BillingCadence::class));
        }

        return $cadence;
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($value instanceof BillingCadence) {
            return $value->value;
        }

        return self::normalizeCadenceValue((string) $value);
    }

    private static function normalizeCadenceValue(string $value): string
    {
        $normalized = trim($value);

        if (
            (str_starts_with($normalized, '"') && str_ends_with($normalized, '"'))
            || (str_starts_with($normalized, '\'') && str_ends_with($normalized, '\''))
        ) {
            $normalized = substr($normalized, 1, -1);
        }

        return match (strtolower($normalized)) {
            'semiannual', 'semi-annual' => BillingCadence::SemiAnnual->value,
            default => $normalized,
        };
    }
}
