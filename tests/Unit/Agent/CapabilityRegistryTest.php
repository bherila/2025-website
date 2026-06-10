<?php

namespace Tests\Unit\Agent;

use App\Models\AgentApiToken;
use App\Support\Agent\AgentContext;
use App\Support\Agent\Capability;
use App\Support\Agent\CapabilityRegistry;
use App\Support\Agent\Modules\ExampleCapabilities;
use InvalidArgumentException;
use Tests\TestCase;

class CapabilityRegistryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // User ID 1 is always treated as admin; occupy it so the users under
        // test are genuinely non-admin.
        $this->createAdminUser();
    }

    private function registryWithExamples(): CapabilityRegistry
    {
        $registry = new CapabilityRegistry;
        ExampleCapabilities::register($registry);

        return $registry;
    }

    public function test_register_duplicate_id_throws(): void
    {
        $registry = $this->registryWithExamples();

        $this->expectException(InvalidArgumentException::class);
        ExampleCapabilities::register($registry);
    }

    public function test_unknown_risk_throws(): void
    {
        $this->expectException(InvalidArgumentException::class);

        new Capability(
            id: 'bad.risk',
            module: 'example',
            label: 'Bad',
            description: 'Bad risk value.',
            requiredPermission: null,
            risk: 'catastrophic',
        );
    }

    public function test_all_for_module_and_find(): void
    {
        $registry = $this->registryWithExamples();
        $registry->register(new Capability(
            id: 'other.module.cap',
            module: 'other',
            label: 'Other',
            description: 'Capability in another module.',
            requiredPermission: null,
            risk: 'read',
        ));

        $this->assertCount(3, $registry->all());
        $this->assertSame(
            ['example.public.ping', 'example.payslips.list'],
            array_map(fn (Capability $capability): string => $capability->id, $registry->forModule('example')),
        );
        $this->assertSame([], $registry->forModule('missing'));
        $this->assertSame('example.public.ping', $registry->find('example.public.ping')?->id);
        $this->assertNull($registry->find('does.not.exist'));
    }

    public function test_anonymous_context_sees_public_capabilities_only(): void
    {
        $registry = $this->registryWithExamples();

        $visible = $registry->visibleTo(new AgentContext(null, null));

        $this->assertSame(
            ['example.public.ping'],
            array_map(fn (Capability $capability): string => $capability->id, $visible),
        );
    }

    public function test_user_without_permission_sees_public_capabilities_only(): void
    {
        $registry = $this->registryWithExamples();
        $user = $this->createUser();

        $visible = $registry->visibleTo(new AgentContext($user, null));

        $this->assertSame(
            ['example.public.ping'],
            array_map(fn (Capability $capability): string => $capability->id, $visible),
        );
    }

    public function test_user_with_permission_sees_permissioned_capability(): void
    {
        $registry = $this->registryWithExamples();
        $user = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);

        $visible = $registry->visibleTo(new AgentContext($user, null));

        $this->assertEqualsCanonicalizing(
            ['example.public.ping', 'example.payslips.list'],
            array_map(fn (Capability $capability): string => $capability->id, $visible),
        );
    }

    public function test_token_scope_hides_out_of_scope_capability(): void
    {
        $registry = $this->registryWithExamples();
        $user = $this->grantFeatures($this->createUser(), ['finance.payslips.view']);
        $token = AgentApiToken::factory()->create([
            'user_id' => $user->id,
            'allowed_permissions' => ['finance.access'],
        ]);

        $visible = $registry->visibleTo(new AgentContext($user, $token));

        $this->assertSame(
            ['example.public.ping'],
            array_map(fn (Capability $capability): string => $capability->id, $visible),
        );
    }

    public function test_container_singleton_resolves(): void
    {
        $this->assertSame(app(CapabilityRegistry::class), app(CapabilityRegistry::class));
    }
}
