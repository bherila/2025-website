<?php

namespace App\Services\Finance\StockQuotes\Exceptions;

/**
 * Thrown when a provider rejects the request because of rate limiting.
 */
class RateLimitedException extends StockQuoteProviderException {}
