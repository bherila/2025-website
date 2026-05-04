<?php

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Spatie\LaravelTypeScriptTransformer\Transformers\DtoTransformer;
use Spatie\TypeScriptTransformer\Collectors\DefaultCollector;
use Spatie\TypeScriptTransformer\Writers\ModuleWriter;

return [
    'auto_discover_types' => [
        app_path('Services/Finance/TaxPreviewFacts/Data'),
    ],

    'collectors' => [
        DefaultCollector::class,
    ],

    'transformers' => [
        DtoTransformer::class,
    ],

    'default_type_replacements' => [
        DateTime::class => 'string',
        DateTimeImmutable::class => 'string',
        CarbonInterface::class => 'string',
        CarbonImmutable::class => 'string',
        Carbon\Carbon::class => 'string',
    ],

    'output_file' => resource_path('js/types/generated/tax-preview-facts.ts'),

    'writer' => ModuleWriter::class,

    'formatter' => null,

    'transform_to_native_enums' => false,

    'transform_null_to_optional' => false,
];
