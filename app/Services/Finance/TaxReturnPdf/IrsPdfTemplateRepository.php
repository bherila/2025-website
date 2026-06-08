<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFormManifest;
use App\Services\Finance\TaxReturnPdf\Data\IrsFormTemplate;
use RuntimeException;

class IrsPdfTemplateRepository
{
    public function manifest(int $year): IrsFormManifest
    {
        $path = resource_path("irs/manifests/{$year}.json");

        if (! is_file($path)) {
            throw new RuntimeException("IRS form manifest is missing for tax year {$year}: {$path}");
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        if (! is_array($decoded)) {
            throw new RuntimeException("IRS form manifest is not valid JSON: {$path}");
        }

        return IrsFormManifest::fromArray($decoded);
    }

    public function template(int $year, string $formId): IrsFormTemplate
    {
        $manifest = $this->manifest($year);
        $template = $manifest->templates[$formId] ?? null;

        if (! $template instanceof IrsFormTemplate) {
            throw new RuntimeException("IRS PDF template {$formId} is not pinned for tax year {$year}.");
        }

        $this->validateTemplate($template);

        return $template;
    }

    public function templatePath(IrsFormTemplate $template): string
    {
        return base_path($template->path);
    }

    public function backgroundPath(IrsFormTemplate $template): string
    {
        if ($template->backgroundPath === null || $template->backgroundPath === '') {
            throw new RuntimeException("IRS PDF background template is not pinned for {$template->formId}.");
        }

        return base_path($template->backgroundPath);
    }

    public function validateTemplate(IrsFormTemplate $template): void
    {
        $path = $this->templatePath($template);

        if (! is_file($path)) {
            throw new RuntimeException("IRS PDF template file is missing for {$template->formId}: {$path}");
        }

        $sha256 = hash_file('sha256', $path);

        if ($sha256 !== $template->sha256) {
            throw new RuntimeException("IRS PDF template hash mismatch for {$template->formId}. Expected {$template->sha256}, got {$sha256}.");
        }

        $this->validateBackgroundTemplate($template);
    }

    public function validateBackgroundTemplate(IrsFormTemplate $template): void
    {
        if ($template->backgroundPath === null || $template->backgroundSha256 === null) {
            return;
        }

        $path = $this->backgroundPath($template);

        if (! is_file($path)) {
            throw new RuntimeException("IRS PDF background template file is missing for {$template->formId}: {$path}");
        }

        $sha256 = hash_file('sha256', $path);

        if ($sha256 !== $template->backgroundSha256) {
            throw new RuntimeException("IRS PDF background template hash mismatch for {$template->formId}. Expected {$template->backgroundSha256}, got {$sha256}.");
        }
    }
}
