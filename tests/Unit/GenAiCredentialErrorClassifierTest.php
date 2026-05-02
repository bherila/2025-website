<?php

namespace Tests\Unit;

use App\GenAiProcessor\Support\GenAiCredentialErrorClassifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GenAiCredentialErrorClassifierTest extends TestCase
{
    use RefreshDatabase;

    public function test_classifies_provider_specific_invalid_credential_messages(): void
    {
        $this->assertTrue(GenAiCredentialErrorClassifier::isInvalidCredential(
            'gemini',
            new \RuntimeException('API key not valid. Please pass a valid API key.')
        ));
        $this->assertTrue(GenAiCredentialErrorClassifier::isInvalidCredential(
            'anthropic',
            new \RuntimeException('invalid x-api-key')
        ));
        $this->assertTrue(GenAiCredentialErrorClassifier::isInvalidCredential(
            'bedrock',
            new \RuntimeException('Invalid API Key format: Must start with pre-defined prefix')
        ));
    }

    public function test_does_not_classify_generic_authorization_failures_as_invalid_credentials(): void
    {
        $this->assertFalse(GenAiCredentialErrorClassifier::isInvalidCredential(
            'bedrock',
            new \RuntimeException('User is not authorized to perform: bedrock:InvokeModel on resource')
        ));
        $this->assertFalse(GenAiCredentialErrorClassifier::isInvalidCredential(
            'gemini',
            new \RuntimeException('forbidden by organization policy')
        ));
        $this->assertFalse(GenAiCredentialErrorClassifier::isInvalidCredential(
            'anthropic',
            new \RuntimeException('authentication required for this organization')
        ));
    }
}
