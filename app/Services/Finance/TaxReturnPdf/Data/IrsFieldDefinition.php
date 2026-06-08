<?php

namespace App\Services\Finance\TaxReturnPdf\Data;

readonly class IrsFieldDefinition
{
    /**
     * @param  array<int, float|int|string>  $rect
     * @param  array<int, string>  $options
     * @param  array<int, string>  $states
     * @param  array<int, string>  $onValues
     */
    public function __construct(
        public string $name,
        public ?string $type,
        public ?int $page,
        public ?string $fieldKind = null,
        public ?string $objectId = null,
        public ?string $value = null,
        public ?string $defaultValue = null,
        public ?string $defaultAppearance = null,
        public ?int $flags = null,
        public ?int $maxLength = null,
        public array $rect = [],
        public array $options = [],
        public array $states = [],
        public array $onValues = [],
    ) {}

    /**
     * @param  array<string, mixed>  $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            name: (string) $data['name'],
            type: isset($data['type']) ? (string) $data['type'] : null,
            fieldKind: isset($data['fieldKind']) ? (string) $data['fieldKind'] : null,
            page: isset($data['page']) ? (int) $data['page'] : null,
            objectId: isset($data['objectId']) ? (string) $data['objectId'] : null,
            value: isset($data['value']) ? (string) $data['value'] : null,
            defaultValue: isset($data['defaultValue']) ? (string) $data['defaultValue'] : null,
            defaultAppearance: isset($data['defaultAppearance']) ? (string) $data['defaultAppearance'] : null,
            flags: isset($data['flags']) ? (int) $data['flags'] : null,
            maxLength: isset($data['maxLength']) ? (int) $data['maxLength'] : null,
            rect: is_array($data['rect'] ?? null) ? array_values($data['rect']) : [],
            options: is_array($data['options'] ?? null) ? array_values(array_map('strval', $data['options'])) : [],
            states: is_array($data['states'] ?? null) ? array_values(array_map('strval', $data['states'])) : [],
            onValues: is_array($data['onValues'] ?? null) ? array_values(array_map('strval', $data['onValues'])) : [],
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'name' => $this->name,
            'type' => $this->type,
            'fieldKind' => $this->fieldKind,
            'page' => $this->page,
            'objectId' => $this->objectId,
            'value' => $this->value,
            'defaultValue' => $this->defaultValue,
            'defaultAppearance' => $this->defaultAppearance,
            'flags' => $this->flags,
            'maxLength' => $this->maxLength,
            'rect' => $this->rect,
            'options' => $this->options,
            'states' => $this->states,
            'onValues' => $this->onValues,
        ];
    }
}
