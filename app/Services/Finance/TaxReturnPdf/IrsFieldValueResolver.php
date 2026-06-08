<?php

namespace App\Services\Finance\TaxReturnPdf;

use Illuminate\Database\Eloquent\Model;

class IrsFieldValueResolver
{
    /**
     * @param  array<string, mixed>  $context
     */
    public function resolve(string $path, array $context): mixed
    {
        $segments = explode('.', $path);
        $current = $context;

        foreach ($segments as $segment) {
            if (is_array($current)) {
                if (! array_key_exists($segment, $current)) {
                    return null;
                }

                $current = $current[$segment];

                continue;
            }

            if ($current instanceof Model) {
                $current = $current->getAttribute($segment);

                continue;
            }

            if (is_object($current) && isset($current->{$segment})) {
                $current = $current->{$segment};

                continue;
            }

            return null;
        }

        return $current;
    }
}
