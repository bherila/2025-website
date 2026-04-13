<?php

namespace Tests\Feature;

use App\GenAiProcessor\Jobs\ParseImportJob;
use App\GenAiProcessor\Models\GenAiImportJob;
use App\Models\Files\FileForTaxDocument;
use App\Models\FinanceTool\FinAccounts;
use App\Models\FinanceTool\TaxDocumentAccount;
use App\Services\TaxDocument\TaxDocumentCreationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class TaxDocumentCreationServiceTest extends TestCase
{
    use RefreshDatabase;

    private TaxDocumentCreationService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(TaxDocumentCreationService::class);
    }

    private function baseDocAttributes(int $userId, array $overrides = []): array
    {
        return array_merge([
            'user_id' => $userId,
            'tax_year' => 2024,
            'form_type' => 'w2',
            'original_filename' => 'w2-2024.pdf',
            'stored_filename' => '2024.01.01 abc12 w2-2024.pdf',
            's3_path' => "tax_docs/{$userId}/2024.01.01 abc12 w2-2024.pdf",
            'mime_type' => 'application/pdf',
            'file_size_bytes' => 102400,
            'file_hash' => str_repeat('a', 64),
            'uploaded_by_user_id' => $userId,
        ], $overrides);
    }

    // ── createSingleAccountDocument ─────────────────────────────────────────────

    public function test_creates_document_and_dispatches_ai_job_when_no_parsed_data(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $doc = $this->service->createSingleAccountDocument(
            $this->baseDocAttributes($user->id)
        );

        $this->assertInstanceOf(FileForTaxDocument::class, $doc);
        $this->assertEquals('pending', $doc->genai_status);
        $this->assertNotNull($doc->genai_job_id);

        $genaiJob = GenAiImportJob::find($doc->genai_job_id);
        $this->assertNotNull($genaiJob);
        $this->assertEquals('tax_document', $genaiJob->job_type);

        Queue::assertPushed(ParseImportJob::class);
    }

    public function test_creates_document_without_ai_job_when_parsed_data_present(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $parsedData = ['employer_name' => 'ACME Corp', 'box1_wages' => 50000];

        $doc = $this->service->createSingleAccountDocument(
            $this->baseDocAttributes($user->id, ['parsed_data' => $parsedData])
        );

        // genai_status is not forced when parsed_data is provided; no job is dispatched.
        $this->assertNull($doc->genai_job_id);
        $this->assertEquals($parsedData, $doc->parsed_data);

        Queue::assertNotPushed(ParseImportJob::class);
    }

    public function test_creates_account_link_when_link_attributes_provided(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $account = FinAccounts::withoutEvents(function () use ($user) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Checking',
            ]);
        });

        $doc = $this->service->createSingleAccountDocument(
            $this->baseDocAttributes($user->id, ['form_type' => '1099_int']),
            [
                'account_id' => $account->acct_id,
                'form_type' => '1099_int',
                'tax_year' => 2024,
            ]
        );

        $links = TaxDocumentAccount::where('tax_document_id', $doc->id)->get();
        $this->assertCount(1, $links);
        $this->assertEquals($account->acct_id, $links->first()->account_id);
    }

    public function test_does_not_create_link_when_no_link_attributes(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $doc = $this->service->createSingleAccountDocument(
            $this->baseDocAttributes($user->id)
        );

        $links = TaxDocumentAccount::where('tax_document_id', $doc->id)->get();
        $this->assertCount(0, $links);
    }

    // ── createMultiAccountDocument ──────────────────────────────────────────────

    public function test_creates_multi_account_document_and_dispatches_job(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $doc = $this->service->createMultiAccountDocument(
            $this->baseDocAttributes($user->id, ['form_type' => 'broker_1099']),
            [['name' => 'Fidelity', 'last4' => '1234']]
        );

        $this->assertInstanceOf(FileForTaxDocument::class, $doc);
        $this->assertEquals('pending', $doc->genai_status);
        $this->assertNotNull($doc->genai_job_id);

        $genaiJob = GenAiImportJob::find($doc->genai_job_id);
        $this->assertNotNull($genaiJob);
        $this->assertEquals('tax_form_multi_account_import', $genaiJob->job_type);

        $contextJson = json_decode($genaiJob->context_json, true);
        $this->assertEquals($doc->id, $contextJson['tax_document_id']);
        $this->assertEquals(2024, $contextJson['tax_year']);
        $this->assertCount(1, $contextJson['accounts']);

        Queue::assertPushed(ParseImportJob::class);
    }

    // ── createImportedDocument ──────────────────────────────────────────────────

    public function test_creates_imported_document_without_ai_job(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $parsedData = ['employer_name' => 'Corp', 'box1_wages' => 75000];

        $doc = $this->service->createImportedDocument(
            $this->baseDocAttributes($user->id, [
                'parsed_data' => $parsedData,
                'genai_status' => 'parsed',
                's3_path' => '',
                'stored_filename' => 'imported',
                'mime_type' => 'application/octet-stream',
                'file_size_bytes' => 0,
                'file_hash' => '',
            ])
        );

        $this->assertNull($doc->genai_job_id);
        $this->assertEquals('parsed', $doc->genai_status);
        $this->assertEquals($parsedData, $doc->parsed_data);

        Queue::assertNotPushed(ParseImportJob::class);
    }

    public function test_creates_imported_document_with_account_links(): void
    {
        Queue::fake();

        $user = $this->createUser();
        $account = FinAccounts::withoutEvents(function () use ($user) {
            return FinAccounts::withoutGlobalScopes()->forceCreate([
                'acct_owner' => $user->id,
                'acct_name' => 'Brokerage',
            ]);
        });

        $doc = $this->service->createImportedDocument(
            $this->baseDocAttributes($user->id, [
                'form_type' => '1099_div',
                'parsed_data' => [],
                'genai_status' => 'parsed',
                's3_path' => '',
                'stored_filename' => 'imported',
                'mime_type' => 'application/octet-stream',
                'file_size_bytes' => 0,
                'file_hash' => '',
            ]),
            [
                ['account_id' => $account->acct_id, 'form_type' => '1099_div', 'tax_year' => 2024],
            ]
        );

        $links = TaxDocumentAccount::where('tax_document_id', $doc->id)->get();
        $this->assertCount(1, $links);
        $this->assertEquals($account->acct_id, $links->first()->account_id);
        $this->assertEquals('1099_div', $links->first()->form_type);
    }
}
