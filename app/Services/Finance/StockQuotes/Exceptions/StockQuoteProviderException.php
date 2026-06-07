<?php

namespace App\Services\Finance\StockQuotes\Exceptions;

use RuntimeException;

/**
 * Base exception for stock-quote provider failures.
 *
 * Subclasses distinguish the failure modes that callers (the
 * finance:backfill-quotes command) must handle explicitly: a missing API key,
 * a provider rate limit, or a failed/invalid HTTP response.
 */
class StockQuoteProviderException extends RuntimeException {}
