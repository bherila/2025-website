<?php

namespace App\Providers;

use App\Support\Agent\AgentContext;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\FinanceCapabilities;
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

        $this->app->singleton(CapabilityRegistry::class, function (): CapabilityRegistry {
            $registry = new CapabilityRegistry;

            // Module capability registrations. Career-comparison, tax, and
            // import modules are added in later PRs.
            FinanceCapabilities::register($registry);

            return $registry;
        });
    }
}
