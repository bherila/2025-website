<?php

namespace App\Services\Finance\StockQuotes\Exceptions;

/**
 * Thrown when a provider requires an API key that is not configured.
 */
class MissingApiKeyException extends StockQuoteProviderException {}
