<?php

namespace Tests\Unit\TaxReturnPdf;

use App\Models\FinanceTool\FinTaxReturnProfile;
use App\Services\Finance\TaxReturnPdf\IrsFieldValueResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IrsFieldValueResolverTest extends TestCase
{
    use RefreshDatabase;

    public function test_resolves_dot_paths_from_arrays_and_models(): void
    {
        $profile = new FinTaxReturnProfile([
            'taxpayer_first_name' => 'Ada',
        ]);

        $resolver = new IrsFieldValueResolver;
        $context = [
            'facts' => [
                'form1040' => [
                    'line9' => 1000,
                ],
            ],
            'profile' => $profile,
        ];

        $this->assertSame(1000, $resolver->resolve('facts.form1040.line9', $context));
        $this->assertSame('Ada', $resolver->resolve('profile.taxpayer_first_name', $context));
        $this->assertNull($resolver->resolve('facts.form1040.missing', $context));
    }
}
