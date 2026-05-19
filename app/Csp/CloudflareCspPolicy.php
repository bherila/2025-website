<?php

namespace App\Csp;

use Spatie\Csp\Directive;
use Spatie\Csp\Keyword;
use Spatie\Csp\Policy;
use Spatie\Csp\Preset;

class CloudflareCspPolicy implements Preset
{
    public function configure(Policy $policy): void
    {
        $policy
            ->add(Directive::DEFAULT, [Keyword::SELF])
            ->add(Directive::SCRIPT, [
                Keyword::SELF,
                Keyword::UNSAFE_EVAL,
                // Hashes for inline scripts injected by the Cloudflare proxy at runtime
                'sha256-RlhVC6WGhVrcsY0hAmbU/YhaSUz2iA2q1f16/7A6jLU=',
                'sha256-w63f9LEKljqLLUqt53Iz8HrxPLoxKWGSbpu4EG+fC/I=',
                'sha256-8+BnHqFPqzqrFsUzcLKGPfEnwOHjnRSMvsGouNq74nM=',
                'https://static.cloudflareinsights.com',
            ])
            ->add(Directive::CONNECT, [
                Keyword::SELF,
                'https://static.cloudflareinsights.com',
                'https://cloudflareinsights.com',
                'https://o933149.ingest.us.sentry.io',
                ...$this->dicomUploadConnectSources(),
            ])
            ->add(Directive::IMG, [
                Keyword::SELF,
                'https://static.cloudflareinsights.com',
            ])
            ->add(Directive::STYLE, [
                Keyword::SELF,
                'https://cdnjs.cloudflare.com',
            ])
            ->add(Directive::OBJECT, [Keyword::NONE])
            ->add(Directive::BASE, [Keyword::SELF])
            ->add(Directive::FRAME_ANCESTORS, [Keyword::NONE])
            ->add(Directive::FORM_ACTION, [Keyword::SELF])
            ->addNonce(Directive::SCRIPT)
            ->addNonce(Directive::STYLE);
    }

    /**
     * @return list<string>
     */
    private function dicomUploadConnectSources(): array
    {
        $sources = [];
        $endpoint = config('filesystems.disks.phr_dicom.endpoint');
        $url = config('filesystems.disks.phr_dicom.url');

        foreach ([$endpoint, $url] as $configuredUrl) {
            $source = $this->originFromUrl($configuredUrl);

            if ($source !== null) {
                $sources[] = $source;
            }
        }

        $virtualHostedSource = $this->dicomVirtualHostedSource($endpoint);

        if ($virtualHostedSource !== null) {
            $sources[] = $virtualHostedSource;
        }

        return array_values(array_unique($sources));
    }

    private function dicomVirtualHostedSource(mixed $endpoint): ?string
    {
        $bucket = config('filesystems.disks.phr_dicom.bucket');

        if (! is_string($bucket) || $bucket === '' || ! is_string($endpoint) || $endpoint === '') {
            return null;
        }

        $parts = parse_url($endpoint);

        if (! is_array($parts)) {
            return null;
        }

        $scheme = $parts['scheme'] ?? null;
        $host = $parts['host'] ?? null;

        if (! is_string($scheme) || ! is_string($host) || ! str_ends_with($host, '.r2.cloudflarestorage.com')) {
            return null;
        }

        if (str_starts_with($host, $bucket.'.')) {
            return null;
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return $scheme.'://'.$bucket.'.'.$host.$port;
    }

    private function originFromUrl(mixed $url): ?string
    {
        if (! is_string($url) || $url === '') {
            return null;
        }

        $parts = parse_url($url);

        if (! is_array($parts)) {
            return null;
        }

        $scheme = $parts['scheme'] ?? null;
        $host = $parts['host'] ?? null;

        if (! is_string($scheme) || ! is_string($host)) {
            return null;
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';

        return $scheme.'://'.$host.$port;
    }
}
