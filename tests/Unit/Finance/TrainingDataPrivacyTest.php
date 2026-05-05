<?php

namespace Tests\Unit\Finance;

use PHPUnit\Framework\TestCase;

class TrainingDataPrivacyTest extends TestCase
{
    public function test_training_data_directory_is_gitignored(): void
    {
        $gitignore = file_get_contents(dirname(__DIR__, 3).'/.gitignore');

        $this->assertIsString($gitignore);
        $this->assertMatchesRegularExpression('/^training_data\\b/m', $gitignore);
    }
}
