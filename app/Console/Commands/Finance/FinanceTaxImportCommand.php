<?php

namespace App\Console\Commands\Finance;

use App\Models\Files\FileForTaxDocument;
use App\Services\TaxDocument\TaxDocumentCreationService;

class FinanceTaxImportCommand extends BaseFinanceCommand
{
    protected $signature = 'finance:tax-import
        {--year= : Tax year for the imported documents (required)}
        {--dry-run : Show what would be written without committing}
        {--schema : Print the expected JSON input schema to stdout and exit}
        {--format=table : Output format for the result summary: table or json}';

    protected $description = 'Import tax document metadata from a JSON payload on stdin';

    /** @var array<mixed> */
    private const INPUT_SCHEMA = [
        'description' => 'Input schema for finance:tax-import. Pass via stdin.',
        'type' => 'object',
        'required' => ['documents'],
        'properties' => [
            'documents' => [
                'type' => 'array',
                'items' => [
                    'type' => 'object',
                    'required' => ['form_type', 'parsed_data'],
                    'properties' => [
                        'form_type' => [
                            'type' => 'string',
                            'enum' => FileForTaxDocument::FORM_TYPES,
                            'description' => 'IRS form type (e.g. w2, 1099_int, k1, broker_1099).',
                        ],
                        'original_filename' => ['type' => 'string', 'description' => 'Original filename for reference.'],
                        'genai_status' => ['type' => 'string', 'description' => 'GenAI parse status (e.g. parsed).'],
                        'is_reviewed' => ['type' => 'boolean', 'description' => 'Whether the document has been reviewed.'],
                        'employment_entity_id' => ['type' => ['integer', 'null'], 'description' => 'Employment entity ID (W-2 forms).'],
                        'account_id' => ['type' => ['integer', 'null'], 'description' => 'Primary account ID.'],
                        'parsed_data' => ['type' => 'object', 'description' => 'Structured form data (form-type-specific JSON).'],
                        'account_links' => [
                            'type' => 'array',
                            'description' => 'Additional account links (fin_tax_document_accounts rows).',
                            'items' => [
                                'type' => 'object',
                                'properties' => [
                                    'account_id' => ['type' => ['integer', 'null']],
                                    'form_type' => ['type' => 'string'],
                                    'tax_year' => ['type' => 'integer'],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ],
    ];

    /**
     * Test hook: set before calling artisan() in a feature test to inject
     * a payload without faking STDIN. Reset to null after the test.
     *
     * @internal
     *
     * @var array<mixed>|null
     */
    public static ?array $testStdinOverride = null;

    /**
     * @return array<mixed>|null
     */
    protected function getStdinData(): ?array
    {
        if (static::$testStdinOverride !== null) {
            return static::$testStdinOverride;
        }

        return $this->readJsonFromStdin();
    }

    public function handle(): int
    {
        if ($this->option('schema')) {
            $this->emitSchema(self::INPUT_SCHEMA);

            return 0;
        }

        if (! $this->validateFormat()) {
            return 1;
        }

        $year = $this->option('year');
        if (! $year || ! ctype_digit((string) $year) || (int) $year < 1900 || (int) $year > 2100) {
            $this->error('--year is required and must be a valid 4-digit year (e.g. --year=2024).');

            return 1;
        }
        $taxYear = (int) $year;

        if ($this->resolveUser() === null) {
            return 1;
        }

        $payload = $this->getStdinData();

        if ($payload === null) {
            $this->error('No JSON payload received on stdin. Pipe a JSON object or use --schema to see the expected format.');

            return 1;
        }

        $documents = $payload['documents'] ?? null;

        if (! is_array($documents) || empty($documents)) {
            $this->error('Payload must contain a non-empty "documents" array.');

            return 1;
        }

        $validDocs = [];
        $errors = [];

        foreach ($documents as $index => $doc) {
            if (! is_array($doc)) {
                $errors[] = "Row {$index}: not an object.";

                continue;
            }

            $formType = $doc['form_type'] ?? null;
            if (! $formType || ! in_array($formType, FileForTaxDocument::FORM_TYPES, true)) {
                $errors[] = "Row {$index}: invalid or missing form_type '{$formType}'. Must be one of: ".implode(', ', FileForTaxDocument::FORM_TYPES).'.';

                continue;
            }

            if (! isset($doc['parsed_data']) || ! is_array($doc['parsed_data'])) {
                $errors[] = "Row {$index}: parsed_data must be a JSON object.";

                continue;
            }

            $validDocs[] = $doc;
        }

        foreach ($errors as $error) {
            $this->error($error);
        }

        if (! empty($errors)) {
            return 1;
        }

        $isDryRun = (bool) $this->option('dry-run');
        $userId = $this->userId();

        $inserted = [];
        $creationService = app(TaxDocumentCreationService::class);

        if (! $isDryRun) {
            foreach ($validDocs as $doc) {
                $docAttributes = [
                    'user_id' => $userId,
                    'tax_year' => $taxYear,
                    'form_type' => $doc['form_type'],
                    'original_filename' => $doc['original_filename'] ?? 'Imported',
                    'stored_filename' => 'imported',
                    's3_path' => '',
                    'mime_type' => 'application/octet-stream',
                    'file_size_bytes' => 0,
                    'file_hash' => '',
                    'uploaded_by_user_id' => $userId,
                    'genai_status' => $doc['genai_status'] ?? 'parsed',
                    'parsed_data' => $doc['parsed_data'],
                    'is_reviewed' => (bool) ($doc['is_reviewed'] ?? false),
                    'employment_entity_id' => $doc['employment_entity_id'] ?? null,
                    'account_id' => $doc['account_id'] ?? null,
                ];

                $accountLinks = array_map(
                    fn ($link) => array_merge(['tax_year' => $taxYear, 'form_type' => $doc['form_type']], $link),
                    array_filter((array) ($doc['account_links'] ?? []), 'is_array'),
                );

                $inserted[] = $creationService->createImportedDocument($docAttributes, $accountLinks);
            }
        }

        $summaryHeaders = ['status', 'count'];
        $summaryRows = [
            [$isDryRun ? 'would_insert' : 'inserted', count($validDocs)],
        ];
        $summaryData = [
            'dry_run' => $isDryRun,
            'inserted' => count($validDocs),
            'ids' => $isDryRun ? [] : array_map(fn ($d) => $d->id, $inserted),
        ];

        $this->outputData($summaryHeaders, $summaryRows, $summaryData);

        return 0;
    }
}
