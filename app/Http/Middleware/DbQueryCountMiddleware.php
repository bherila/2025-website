<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Dev-only middleware that logs the total number of database queries executed
 * per request and warns when a per-endpoint threshold is exceeded.
 *
 * This is registered only in the local environment (see bootstrap/app.php).
 * It is intended to surface N+1 query problems during development and to
 * capture query-count baselines before backend refactors land.
 *
 * Per-endpoint warning thresholds live in QUERY_THRESHOLDS below.
 * Any route not listed there falls back to DEFAULT_THRESHOLD.
 */
class DbQueryCountMiddleware
{
    private const DEFAULT_THRESHOLD = 50;

    /**
     * Per-route-prefix query count warning thresholds.
     * Keys are matched as prefixes of the resolved route URI (not the full URL).
     *
     * @var array<string, int>
     */
    private const QUERY_THRESHOLDS = [
        'api/finance/documents' => 30,
        'api/finance/tax-preview-data' => 40,
        'api/finance/tax-years' => 30,
        'api/finance/lot-workspace' => 30,
        'api/finance/tax-documents' => 30,
        'api/finance/capital-gains' => 30,
        'api/finance/all/lots' => 50,
    ];

    public function handle(Request $request, Closure $next): Response
    {
        // Only instrument in local development — no-op in all other environments.
        if (! app()->environment('local')) {
            return $next($request);
        }

        DB::enableQueryLog();
        $start = hrtime(true);

        $response = $next($request);

        $elapsed = (hrtime(true) - $start) / 1_000_000; // ms
        $queries = DB::getQueryLog();
        $count = count($queries);
        $threshold = $this->threshold($request);

        $context = [
            'method' => $request->method(),
            'uri' => $request->path(),
            'query_count' => $count,
            'elapsed_ms' => round($elapsed, 2),
            'threshold' => $threshold,
        ];

        if ($count > $threshold) {
            Log::warning("db-query-count: {$count} queries exceeded threshold of {$threshold}", $context);
        } else {
            Log::debug("db-query-count: {$count} queries in {$context['elapsed_ms']} ms", $context);
        }

        return $response;
    }

    private function threshold(Request $request): int
    {
        $uri = ltrim($request->path(), '/');

        foreach (self::QUERY_THRESHOLDS as $prefix => $limit) {
            if (str_starts_with($uri, $prefix)) {
                return $limit;
            }
        }

        return self::DEFAULT_THRESHOLD;
    }
}
