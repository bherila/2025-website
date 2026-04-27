<?php

namespace App\Services;

use Bherila\GenAiLaravel\Contracts\GenAiClient;

class GenAiFileHelper
{
    /**
     * Upload a file to the provider's File API if supported, then converse.
     * For providers without a File API (Anthropic, Bedrock), falls back to inline base64.
     *
     * @param  resource  $stream
     */
    public static function send(
        GenAiClient $client,
        mixed $stream,
        string $mimeType,
        string $name,
        string $prompt,
        mixed $toolConfig = null,
    ): mixed {
        $fileUri = $client->uploadFile($stream, $mimeType, $name);

        if ($fileUri !== null) {
            try {
                return $client->converseWithFileRef($fileUri, $mimeType, $prompt, $toolConfig);
            } finally {
                $client->deleteFile($fileUri);
            }
        }

        // Provider has no File API — read stream into memory and send inline.
        $bytes = stream_get_contents($stream);

        return $client->converseWithInlineFile(base64_encode($bytes), $mimeType, $prompt, '', $toolConfig);
    }

    /**
     * Check that the file size is within the provider's accepted limit.
     */
    public static function withinSizeLimit(GenAiClient $client, int $bytes): bool
    {
        return $bytes <= $client::maxFileBytes();
    }
}
