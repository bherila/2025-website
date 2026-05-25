<?php

namespace App\Console\Commands;

use App\Services\Finance\Testing\ReconciliationDriftFixtureBuilder;
use Illuminate\Console\Command;

class SeedReconDriftFixture extends Command
{
    protected $signature = 'finance:seed-recon-drift-fixture {--tax-year=2025} {--force : Allow running outside local/testing environments}';

    protected $description = 'Seed a deterministic lot-reconciliation drift fixture for Playwright E2E coverage';

    public function handle(ReconciliationDriftFixtureBuilder $builder): int
    {
        if (! $this->option('force') && ! app()->environment(['local', 'testing'])) {
            $this->error('Refusing to seed E2E fixture in '.app()->environment().' environment. Re-run with --force to override.');

            return self::FAILURE;
        }

        $taxYear = (int) $this->option('tax-year');
        $payload = $builder->build($taxYear);

        $this->line(json_encode($payload, JSON_THROW_ON_ERROR));

        return self::SUCCESS;
    }
}
