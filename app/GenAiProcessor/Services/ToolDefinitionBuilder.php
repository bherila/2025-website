<?php

namespace App\GenAiProcessor\Services;

/**
 * Utility class for building Gemini function-calling tool definitions.
 *
 * Provides static factory methods for the common property types so that
 * each `buildXxxToolDefinition()` method can use a declarative style instead
 * of repeating `['type' => 'NUMBER']` etc. inline.
 *
 * Usage:
 *   use App\GenAiProcessor\Services\ToolDefinitionBuilder as Tdb;
 *
 *   'my_field' => Tdb::number(),
 *   'name'     => Tdb::string(),
 *   'active'   => Tdb::boolean(),
 *   'items'    => Tdb::arrayOf(Tdb::object(['id' => Tdb::number()], ['id'])),
 */
class ToolDefinitionBuilder
{
    /** @return array{type: 'NUMBER'} */
    public static function number(): array
    {
        return ['type' => 'NUMBER'];
    }

    /** @return array{type: 'STRING'} */
    public static function string(): array
    {
        return ['type' => 'STRING'];
    }

    /** @return array{type: 'BOOLEAN'} */
    public static function boolean(): array
    {
        return ['type' => 'BOOLEAN'];
    }

    /**
     * Build an OBJECT property schema.
     *
     * @param  array<string,array<string,mixed>>  $properties  Keyed property schemas
     * @param  string[]  $required  Required property names
     * @return array<string,mixed>
     */
    public static function object(array $properties, array $required = []): array
    {
        $schema = [
            'type' => 'OBJECT',
            'properties' => $properties,
        ];

        if ($required !== []) {
            $schema['required'] = $required;
        }

        return $schema;
    }

    /**
     * Build an ARRAY property schema with a given item schema.
     *
     * @param  array<string,mixed>  $itemSchema  Schema for each array element
     * @return array<string,mixed>
     */
    public static function arrayOf(array $itemSchema): array
    {
        return [
            'type' => 'ARRAY',
            'items' => $itemSchema,
        ];
    }

    /**
     * Build the top-level function definition wrapper used by Gemini.
     *
     * @param  string  $name  Tool/function name
     * @param  string  $description  Human-readable description
     * @param  array<string,array<string,mixed>>  $properties  Parameter properties
     * @param  string[]  $required  Required parameter names
     * @return array<string,mixed>
     */
    public static function functionDefinition(
        string $name,
        string $description,
        array $properties,
        array $required = [],
    ): array {
        return [
            'name' => $name,
            'description' => $description,
            'parameters' => self::object($properties, $required),
        ];
    }
}
