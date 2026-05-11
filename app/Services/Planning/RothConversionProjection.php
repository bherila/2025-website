<?php

namespace App\Services\Planning;

final readonly class RothConversionProjection
{
    /**
     * @param  array<string, mixed>  $data
     */
    public function __construct(private array $data) {}

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return $this->data;
    }

    /**
     * @return array<string, mixed>
     */
    public function inputs(): array
    {
        return is_array($this->data['inputs'] ?? null) ? $this->data['inputs'] : [];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function scenarios(): array
    {
        return is_array($this->data['scenarios'] ?? null) ? array_values(array_filter($this->data['scenarios'], 'is_array')) : [];
    }

    /**
     * @return array<string, mixed>
     */
    public function reference(): array
    {
        return is_array($this->data['reference'] ?? null) ? $this->data['reference'] : [];
    }

    /**
     * @return list<string>
     */
    public function warnings(): array
    {
        return is_array($this->data['warnings'] ?? null) ? array_values(array_filter($this->data['warnings'], 'is_string')) : [];
    }
}
