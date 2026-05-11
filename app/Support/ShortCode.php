<?php

namespace App\Support;

final class ShortCode
{
    private const string ALPHABET = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';

    public static function generate(callable $exists, int $length = 7, int $maxAttempts = 20): string
    {
        for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
            $code = self::random($length);

            if (! $exists($code)) {
                return $code;
            }
        }

        throw new \RuntimeException('Unable to generate a unique short code.');
    }

    private static function random(int $length): string
    {
        $code = '';
        $max = strlen(self::ALPHABET) - 1;

        for ($i = 0; $i < $length; $i++) {
            $code .= self::ALPHABET[random_int(0, $max)];
        }

        return $code;
    }
}
