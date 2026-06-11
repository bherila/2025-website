<?php

namespace App\Support\Agent;

use InvalidArgumentException;

/**
 * In-memory registry of agent capabilities (container singleton, registered
 * by AgentServiceProvider). Visibility filtering delegates to AgentContext
 * (and therefore FeatureAccess) — dependency resolution and the admin bypass
 * are never reimplemented here, and token scopes still shrink visibility.
 */
class CapabilityRegistry
{
    /** @var array<string, Capability> */
    private array $capabilities = [];

    public function register(Capability $capability): void
    {
        if (isset($this->capabilities[$capability->id])) {
            throw new InvalidArgumentException("Capability [{$capability->id}] is already registered.");
        }

        $this->capabilities[$capability->id] = $capability;
    }

    /** @return list<Capability> */
    public function all(): array
    {
        return array_values($this->capabilities);
    }

    /** @return list<Capability> */
    public function forModule(string $module): array
    {
        return array_values(array_filter(
            $this->capabilities,
            fn (Capability $capability): bool => $capability->module === $module,
        ));
    }

    /**
     * Capabilities visible to the given agent context: public capabilities
     * are always visible; permissioned ones require the context to pass both
     * the user's feature permissions and the token scope.
     *
     * @return list<Capability>
     */
    public function visibleTo(AgentContext $context): array
    {
        return array_values(array_filter(
            $this->capabilities,
            fn (Capability $capability): bool => $capability->isPublic()
                || ($context->allowsModule($capability->module) && $context->can((string) $capability->requiredPermission)),
        ));
    }

    public function find(string $id): ?Capability
    {
        return $this->capabilities[$id] ?? null;
    }
}
