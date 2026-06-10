<?php

namespace App\Support\Accounting;

use Exception;
use Illuminate\Http\JsonResponse;

/**
 * Thrown when a write would touch an accounting period that has been locked
 * (e.g. a locked partnership-basis tax year). Renders as a structured 409 so
 * agent clients can distinguish "locked, unlock first" from other failures.
 *
 * Unlocking remains the responsibility of the existing domain endpoints
 * (e.g. partnership-basis unlock, which requires a reason); there is no
 * generic unlock API.
 */
class PeriodLockedException extends Exception
{
    public function __construct(
        public readonly string $domain,
        public readonly int $year,
        public readonly ?int $accountId = null,
        string $message = 'This period is locked.',
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'locked' => true,
            'domain' => $this->domain,
            'year' => $this->year,
            'unlock_required' => true,
        ], 409);
    }
}
