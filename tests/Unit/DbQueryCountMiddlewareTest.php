<?php

namespace Tests\Unit;

use App\Http\Middleware\DbQueryCountMiddleware;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Psr\Log\AbstractLogger;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class DbQueryCountMiddlewareTest extends TestCase
{
    public function test_it_logs_query_count_and_elapsed_time_for_local_requests(): void
    {
        $originalEnvironment = app()->environment();
        app()->detectEnvironment(static fn (): string => 'local');
        $logger = $this->swapLogRecorder();

        try {
            $request = Request::create('/api/finance/lot-workspace', 'GET');
            $middleware = new DbQueryCountMiddleware;

            $response = $middleware->handle($request, function (): Response {
                DB::select('select 1');

                return new Response('ok');
            });

            $this->assertSame(200, $response->getStatusCode());
            $debugRecords = array_values(array_filter(
                $logger->records,
                fn (array $record): bool => $record['level'] === 'debug'
                    && str_starts_with($record['message'], 'db-query-count: 1 queries')
                    && $record['context']['method'] === 'GET'
                    && $record['context']['uri'] === 'api/finance/lot-workspace'
                    && $record['context']['query_count'] === 1
                    && $record['context']['elapsed_ms'] >= 0
                    && $record['context']['threshold'] === 30,
            ));
            $this->assertCount(1, $debugRecords);
        } finally {
            app()->detectEnvironment(static fn (): string => $originalEnvironment);
            DB::flushQueryLog();
        }
    }

    /**
     * @return object{records: list<array{level: string, message: string, context: array<string, mixed>}>}
     */
    private function swapLogRecorder(): object
    {
        $logger = new class extends AbstractLogger
        {
            /**
             * @var list<array{level: string, message: string, context: array<string, mixed>}>
             */
            public array $records = [];

            /**
             * @param  array<string, mixed>  $context
             */
            public function log($level, string|\Stringable $message, array $context = []): void
            {
                $this->records[] = [
                    'level' => (string) $level,
                    'message' => (string) $message,
                    'context' => $context,
                ];
            }
        };

        Log::swap($logger);

        return $logger;
    }
}
