<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_S3_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

        // PHR DICOM object storage. Currently a local directory so we don't
        // pay R2 round trips for the small volume we have today. The path is
        // env-overridable so prod can point at a directory outside the deploy
        // tree (the CI rsync uses --delete on `storage`, see ci.yml). To move
        // to S3/R2 later: change driver to 's3' and add the usual AWS_*
        // settings — the application code only references the disk by name.
        'phr_dicom' => [
            'driver' => 'local',
            'root' => env('PHR_DICOM_DISK_ROOT', storage_path('app/private/phr-dicom')),
            'throw' => false,
            'report' => false,
        ],

        'phr_documents' => [
            'driver' => 'local',
            'root' => env('PHR_DOCUMENTS_DISK_ROOT', storage_path('app/private/phr-documents')),
            'throw' => false,
            'report' => false,
        ],

        'phr_exports' => [
            'driver' => 'local',
            'root' => env('PHR_EXPORTS_DISK_ROOT', storage_path('app/private/phr-exports')),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
