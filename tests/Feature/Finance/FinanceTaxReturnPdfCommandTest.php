<?php

namespace Tests\Feature\Finance;

use App\Models\User;
use App\Services\Finance\TaxReturnPdf\Data\TaxReturnPdfOptions;
use App\Services\Finance\TaxReturnPdf\IrsReturnPdfBuilder;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Mockery\MockInterface;
use Tests\TestCase;

class FinanceTaxReturnPdfCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        putenv('FINANCE_CLI_USER_ID');

        parent::tearDown();
    }

    public function test_command_defaults_to_finance_cli_user_id_when_user_option_is_missing(): void
    {
        $user = User::factory()->create();
        User::factory()->create();
        putenv("FINANCE_CLI_USER_ID={$user->id}");
        $out = storage_path('app/testing/finance-tax-return-pdf-env-test.pdf');

        if (is_file($out)) {
            unlink($out);
        }

        $this->mock(IrsReturnPdfBuilder::class, function (MockInterface $mock) use ($user): void {
            $mock->shouldReceive('buildForUser')
                ->once()
                ->withArgs(function (User $actualUser, TaxReturnPdfOptions $options) use ($user): bool {
                    return $actualUser->is($user)
                        && $options->year === 2025
                        && $options->formId === 'form-1040'
                        && $options->filename === 'finance-tax-return-pdf-env-test.pdf';
                })
                ->andReturn("%PDF-1.4\n%");
        });

        $this->artisan('finance:tax-return-pdf', [
            '--out' => 'storage/app/testing/finance-tax-return-pdf-env-test.pdf',
        ])->assertExitCode(Command::SUCCESS);

        $this->assertFileExists($out);
        unlink($out);
    }
}
