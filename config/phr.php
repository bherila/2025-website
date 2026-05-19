<?php

return [
    'exports_retention_days' => (int) env('PHR_EXPORTS_RETENTION_DAYS', 30),
    'documents_retention_days' => (int) env('PHR_DOCUMENTS_RETENTION_DAYS', 30),
    'dicom_max_file_bytes' => (int) env('PHR_DICOM_MAX_FILE_BYTES', 1024 * 1024 * 1024),
];
