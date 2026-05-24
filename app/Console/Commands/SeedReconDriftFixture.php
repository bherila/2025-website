<?php

namespace App\Console\Commands;

use App\Services\Finance\Testing\ReconciliationDriftFixtureBuilder;
use Illuminate\Console\Command;

class SeedReconDriftFixture extends Command
{
    protected $signature = 'finance:seed-recon-drift-fixture {--tax-year=2025}';

    protected $description = 'Seed a deterministic lot-reconciliation drift fixture for Playwright E2E coverage';

    public function handle(ReconciliationDriftFixtureBuilder $builder): int
    {
        $taxYear = (int) $this->option('tax-year');
        $payload = $builder->build($taxYear);

        $this->line(json_encode($payload, JSON_THROW_ON_ERROR));

        return self::SUCCESS;
    }
}
