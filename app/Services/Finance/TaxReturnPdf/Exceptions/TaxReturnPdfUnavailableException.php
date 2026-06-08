<?php

namespace App\Services\Finance\TaxReturnPdf\Exceptions;

use RuntimeException;

class TaxReturnPdfUnavailableException extends RuntimeException
{
    /**
     * @param  array<int, string>  $errors
     * @param  array<int, string>  $warnings
     */
    public function __construct(
        public readonly array $errors,
        public readonly array $warnings = [],
    ) {
        parent::__construct(implode(' ', $errors));
    }
}
