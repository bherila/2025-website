<?php

namespace App\Services\Finance\TaxReturnPdf;

use App\Services\Finance\TaxReturnPdf\Data\IrsFieldDefinition;
use Carbon\CarbonInterface;
use DateTimeInterface;

class IrsFieldValueFormatter
{
    /**
     * @param  array<string, mixed>  $mapping
     */
    public function format(mixed $value, array $mapping, ?IrsFieldDefinition $field = null): string|bool|null
    {
        $format = (string) ($mapping['format'] ?? 'text');

        return match ($format) {
            'amount' => $this->amount($value, (bool) ($mapping['blankIfZero'] ?? false)),
            'checkbox' => $this->checkbox($value, $mapping),
            'ssn' => $this->identifier($value, [3, 2, 4], $mapping),
            'ein' => $this->identifier($value, [2, 7], $mapping),
            'date' => $this->date($value),
            'phone' => $this->phone($value),
            default => $this->text($value),
        };
    }

    private function text(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        if (is_bool($value)) {
            return $value ? 'Yes' : 'No';
        }

        if (is_scalar($value)) {
            $string = trim((string) $value);

            return $string === '' ? null : $string;
        }

        return null;
    }

    private function amount(mixed $value, bool $blankIfZero): ?string
    {
        if (! is_numeric($value)) {
            return null;
        }

        $rounded = (int) round((float) $value);

        if ($blankIfZero && $rounded === 0) {
            return null;
        }

        return (string) $rounded;
    }

    /**
     * @param  array<string, mixed>  $mapping
     */
    private function checkbox(mixed $value, array $mapping): bool
    {
        if (array_key_exists('checkedWhen', $mapping)) {
            return (string) $value === (string) $mapping['checkedWhen'];
        }

        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    /**
     * @param  array<int, int>  $groups
     * @param  array<string, mixed>  $mapping
     */
    private function identifier(mixed $value, array $groups, array $mapping): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $value) ?? '';

        if ($digits === '') {
            return null;
        }

        if (isset($mapping['segment']) && is_numeric($mapping['segment'])) {
            $offset = 0;
            $segment = (int) $mapping['segment'];

            foreach ($groups as $index => $length) {
                if ($index + 1 === $segment) {
                    return substr($digits, $offset, $length) ?: null;
                }

                $offset += $length;
            }
        }

        $parts = [];
        $offset = 0;

        foreach ($groups as $length) {
            $parts[] = substr($digits, $offset, $length);
            $offset += $length;
        }

        return implode('-', array_filter($parts, static fn (string $part): bool => $part !== ''));
    }

    private function date(mixed $value): ?string
    {
        if ($value instanceof CarbonInterface || $value instanceof DateTimeInterface) {
            return $value->format('m/d/Y');
        }

        $string = $this->text($value);
        if ($string === null) {
            return null;
        }

        $timestamp = strtotime($string);

        return $timestamp === false ? $string : date('m/d/Y', $timestamp);
    }

    private function phone(mixed $value): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $value) ?? '';

        if (strlen($digits) === 10) {
            return sprintf('(%s) %s-%s', substr($digits, 0, 3), substr($digits, 3, 3), substr($digits, 6));
        }

        return $this->text($value);
    }
}
