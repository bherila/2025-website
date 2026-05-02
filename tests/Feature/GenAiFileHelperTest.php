<?php

namespace Tests\Feature;

use App\Services\GenAiFileHelper;
use Bherila\GenAiLaravel\Contracts\GenAiClient;
use Bherila\GenAiLaravel\ModelInfo;
use Bherila\GenAiLaravel\ToolConfig;
use Bherila\GenAiLaravel\Usage;
use Tests\TestCase;

class GenAiFileHelperTest extends TestCase
{
    public function test_send_adds_assistant_prefill_for_inline_file_requests(): void
    {
        $client = new class implements GenAiClient
        {
            /** @var list<array{role: string, content: array<int, mixed>}> */
            public array $messages = [];

            public function provider(): string
            {
                return 'test';
            }

            public function model(): string
            {
                return 'test-model';
            }

            public static function maxFileBytes(): int
            {
                return 1024;
            }

            public function converse(string $system, array $messages, ?ToolConfig $toolConfig = null): array
            {
                $this->messages = $messages;

                return ['content' => [['type' => 'text', 'text' => '1]:']]];
            }

            public function uploadFile(mixed $fileContent, string $mimeType, string $displayName = ''): ?string
            {
                return null;
            }

            public function deleteFile(string $fileRef): void {}

            public function converseWithFileRef(string $fileRef, string $mimeType, string $prompt, ?ToolConfig $toolConfig = null): array
            {
                return [];
            }

            public function converseWithInlineFile(string $fileBytes, string $mimeType, string $prompt, string $system = '', ?ToolConfig $toolConfig = null): array
            {
                return [];
            }

            public function extractText(array $response): string
            {
                return '';
            }

            public function extractToolCalls(array $response): array
            {
                return [];
            }

            public function checkCredentials(): bool
            {
                return true;
            }

            public function listModels(): array
            {
                return [new ModelInfo(id: 'test-model', name: 'Test Model', provider: 'test')];
            }

            public function extractUsage(array $response): Usage
            {
                return Usage::empty();
            }
        };

        $stream = fopen('php://temp', 'r+');
        $this->assertIsResource($stream);
        fwrite($stream, 'pdf bytes');

        $response = GenAiFileHelper::send(
            $client,
            $stream,
            'application/pdf',
            'test.pdf',
            'Extract this.',
            assistantPrefill: 'accounts[',
        );

        $this->assertSame('accounts[', $response[GenAiFileHelper::ASSISTANT_PREFILL_RESPONSE_KEY]);
        $this->assertSame('user', $client->messages[0]['role']);
        $this->assertSame('document', $client->messages[0]['content'][0]->type);
        $this->assertSame('text', $client->messages[0]['content'][1]->type);
        $this->assertSame('assistant', $client->messages[1]['role']);
        $this->assertSame('accounts[', $client->messages[1]['content'][0]->text);
    }
}
