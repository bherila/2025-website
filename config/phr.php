<?php

return [
    'exports_retention_days' => (int) env('PHR_EXPORTS_RETENTION_DAYS', 30),
    'documents_retention_days' => (int) env('PHR_DOCUMENTS_RETENTION_DAYS', 30),
];
