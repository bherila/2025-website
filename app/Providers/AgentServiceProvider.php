<?php

namespace App\Providers;

use App\Services\Finance\Locks\PartnershipBasisLockGuard;
use App\Support\Accounting\AccountingPeriodLockGuard;
use App\Support\Agent\AgentContext;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\CareerComparisonCapabilities;
use App\Support\Agent\Modules\FinanceCapabilities;
use App\Support\Agent\Modules\ImportCapabilities;
use App\Support\Agent\Modules\TaxCapabilities;
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

        $this->app->bind(AccountingPeriodLockGuard::class, PartnershipBasisLockGuard::class);

        $this->app->singleton(CapabilityRegistry::class, function (): CapabilityRegistry {
            $registry = new CapabilityRegistry;

            FinanceCapabilities::register($registry);
            ImportCapabilities::register($registry);
            CareerComparisonCapabilities::register($registry);
            TaxCapabilities::register($registry);

            return $registry;
        });
    }
}
