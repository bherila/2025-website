<?php

return [
    'presets' => [
        App\Csp\CloudflareCspPolicy::class,
    ],

    'directives' => [],

    'report_only_presets' => [],

    'report_only_directives' => [],

    'report_uri' => env('CSP_REPORT_URI', ''),

    'enabled' => env('CSP_ENABLED', true),

    'enabled_while_hot_reloading' => env('CSP_ENABLED_WHILE_HOT_RELOADING', false),

    'nonce_generator' => Spatie\Csp\Nonce\RandomString::class,

    'nonce_enabled' => env('CSP_NONCE_ENABLED', true),
];
