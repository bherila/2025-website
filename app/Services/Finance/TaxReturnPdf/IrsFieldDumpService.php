<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use RuntimeException;
use Smalot\PdfParser\Document;
use Smalot\PdfParser\Element;
use Smalot\PdfParser\Element\ElementArray;
use Smalot\PdfParser\Element\ElementMissing;
use Smalot\PdfParser\Header;
use Smalot\PdfParser\Parser;
use Smalot\PdfParser\PDFObject;

class IrsFieldDumpService
{
    /**
     * @return array<int, IrsFieldDefinition>
     */
    public function dump(string $templatePath): array
    {
        if (! is_file($templatePath)) {
            throw new RuntimeException("PDF template does not exist: {$templatePath}");
        }

        $document = (new Parser)->parseFile($templatePath);
        $pageNumbers = $this->pageNumbers($document);
        $fields = [];

        foreach ($document->getObjectsByType('Annot', 'Widget') as $objectId => $object) {
            if (! $object instanceof PDFObject) {
                continue;
            }

            $name = $this->stringValue($object->get('T'));
            if ($name === null || $name === '') {
                continue;
            }

            $appearanceStates = $this->appearanceStates($object);

            $fields[] = new IrsFieldDefinition(
                name: $name,
                type: $this->stringValue($object->get('FT')),
                page: $this->pageNumber($object, $pageNumbers),
                objectId: (string) $objectId,
                value: $this->stringValue($object->get('V')),
                defaultValue: $this->stringValue($object->get('DV')),
                flags: $this->intValue($object->get('Ff')),
                maxLength: $this->intValue($object->get('MaxLen')),
                rect: $this->arrayValue($object->get('Rect')),
                options: $this->options($object->get('Opt')),
                states: $appearanceStates,
                onValues: array_values(array_filter($appearanceStates, static fn (string $state): bool => $state !== 'Off')),
            );
        }

        usort($fields, static function (IrsFieldDefinition $left, IrsFieldDefinition $right): int {
            $leftY = (float) ($left->rect[1] ?? 0);
            $rightY = (float) ($right->rect[1] ?? 0);
            $leftX = (float) ($left->rect[0] ?? 0);
            $rightX = (float) ($right->rect[0] ?? 0);

            return [$left->page ?? 999, -$leftY, $leftX, $left->name]
                <=> [$right->page ?? 999, -$rightY, $rightX, $right->name];
        });

        return $fields;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function dumpArray(string $templatePath): array
    {
        return array_map(
            static fn (IrsFieldDefinition $field): array => $field->toArray(),
            $this->dump($templatePath),
        );
    }

    /**
     * @return array<string, int>
     */
    private function pageNumbers(Document $document): array
    {
        $numbers = [];

        foreach ($document->getPages() as $index => $page) {
            $numbers[(string) spl_object_id($page)] = $index + 1;
        }

        return $numbers;
    }

    /**
     * @param  array<string, int>  $pageNumbers
     */
    private function pageNumber(PDFObject $object, array $pageNumbers): ?int
    {
        $page = $object->get('P');

        if ($page instanceof PDFObject) {
            return $pageNumbers[(string) spl_object_id($page)] ?? null;
        }

        return null;
    }

    private function stringValue(mixed $value): ?string
    {
        if ($value instanceof ElementMissing) {
            return null;
        }

        if ($value instanceof Element) {
            $string = trim((string) $value);

            return $string === '' ? null : $string;
        }

        if ($value instanceof Header || $value instanceof PDFObject) {
            return null;
        }

        if (is_scalar($value)) {
            $string = trim((string) $value);

            return $string === '' ? null : $string;
        }

        return null;
    }

    private function intValue(mixed $value): ?int
    {
        $string = $this->stringValue($value);

        if ($string === null || ! is_numeric($string)) {
            return null;
        }

        return (int) $string;
    }

    /**
     * @return array<int, float|int|string>
     */
    private function arrayValue(mixed $value): array
    {
        if (! $value instanceof ElementArray) {
            return [];
        }

        $items = [];

        foreach ($value->getContent() as $item) {
            if ($item instanceof Element || is_scalar($item)) {
                $raw = trim((string) $item);
                $items[] = is_numeric($raw) ? (float) $raw : $raw;
            }
        }

        return $items;
    }

    /**
     * @return array<int, string>
     */
    private function options(mixed $value): array
    {
        if (! $value instanceof ElementArray) {
            return [];
        }

        $options = [];

        foreach ($value->getContent() as $item) {
            if ($item instanceof ElementArray) {
                $details = $item->getDetails();
                foreach ($details as $detail) {
                    if (is_scalar($detail)) {
                        $options[] = (string) $detail;
                    }
                }
            } elseif ($item instanceof Element || is_scalar($item)) {
                $options[] = trim((string) $item);
            }
        }

        return array_values(array_unique(array_filter($options, static fn (string $option): bool => $option !== '')));
    }

    /**
     * @return array<int, string>
     */
    private function appearanceStates(PDFObject $object): array
    {
        $appearance = $object->get('AP');
        $details = $this->details($appearance);
        $states = [];

        foreach (['N', 'D', 'R'] as $appearanceKind) {
            $entries = $details[$appearanceKind] ?? null;
            if (! is_array($entries)) {
                continue;
            }

            foreach (array_keys($entries) as $state) {
                $state = (string) $state;
                if ($state !== '') {
                    $states[] = $state;
                }
            }
        }

        return array_values(array_unique($states));
    }

    /**
     * @return array<mixed>
     */
    private function details(mixed $value): array
    {
        if ($value instanceof Header || $value instanceof PDFObject || $value instanceof ElementArray) {
            return $value->getDetails();
        }

        return [];
    }
}
