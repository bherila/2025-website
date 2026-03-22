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
}
