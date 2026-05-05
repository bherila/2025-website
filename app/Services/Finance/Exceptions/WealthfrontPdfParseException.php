<?php

namespace App\Services\Finance\Exceptions;

use RuntimeException;

class WealthfrontPdfParseException extends RuntimeException
{
    public static function invalidPath(string $path): self
    {
        return new self("Wealthfront PDF path is not a readable local file: {$path}");
    }

    public static function tooLarge(string $path, int $bytes, int $limit): self
    {
        return new self("Wealthfront PDF is too large to parse safely: {$path} ({$bytes} bytes, limit {$limit}).");
    }

    public static function parseFailed(string $path, string $message): self
    {
        return new self("Wealthfront PDF parsing failed for {$path}: {$message}");
    }
}
