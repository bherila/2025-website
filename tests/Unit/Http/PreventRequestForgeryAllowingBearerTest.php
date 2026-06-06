<?php

namespace Tests\Unit\Http;

use App\Http\Middleware\PreventRequestForgeryAllowingBearer;
use Closure;
use Illuminate\Contracts\Encryption\Encrypter;
use Illuminate\Http\Request;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\Store;
use Illuminate\Session\TokenMismatchException;
use Symfony\Component\HttpFoundation\Response;
use Tests\TestCase;

class PreventRequestForgeryAllowingBearerTest extends TestCase
{
    /**
     * Build the middleware with the framework's unit-test CSRF bypass disabled so
     * the test reflects production behaviour (where runningUnitTests() is false).
     */
    private function productionLikeMiddleware(): PreventRequestForgeryAllowingBearer
    {
        $encrypter = $this->app->make(Encrypter::class);

        return new class($this->app, $encrypter) extends PreventRequestForgeryAllowingBearer
        {
            protected function runningUnitTests(): bool
            {
                return false;
            }
        };
    }

    private function pass(): Closure
    {
        return fn (): Response => new Response('ok');
    }

    public function test_bearer_token_requests_skip_csrf_verification(): void
    {
        $request = Request::create('/api/financial-planning/career-comparison/workflows', 'POST');
        $request->headers->set('Authorization', 'Bearer some-mcp-api-key');

        $response = $this->productionLikeMiddleware()->handle($request, $this->pass());

        $this->assertSame('ok', $response->getContent());
    }

    public function test_cookie_session_requests_without_a_token_still_fail_csrf(): void
    {
        $request = Request::create('/api/financial-planning/career-comparison/workflows', 'POST');
        $session = new Store('test-session', new ArraySessionHandler(120));
        $session->start();
        $request->setLaravelSession($session);

        $this->expectException(TokenMismatchException::class);

        $this->productionLikeMiddleware()->handle($request, $this->pass());
    }
}
