<?php

namespace App\Providers;

use App\Support\Agent\AgentContext;
use Illuminate\Support\ServiceProvider;

/**
 * Container wiring for the agent API layer.
 *
 * The agent auth middleware overrides the AgentContext binding with a
 * request-specific instance; the scoped default here keeps resolution safe
 * (anonymous) for code paths that run before/without that middleware.
 */
class AgentServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(AgentContext::class, fn (): AgentContext => new AgentContext(null, null));
    }
}
