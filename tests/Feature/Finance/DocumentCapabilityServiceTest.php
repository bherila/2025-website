<?php

namespace Tests\Feature\Finance;

use App\Models\FinanceTool\FinAccountLot;
use App\Models\FinanceTool\FinDocument;
use App\Models\FinanceTool\FinDocumentAccount;
use App\Services\Finance\DocumentCapabilityService;
use Tests\TestCase;

class DocumentCapabilityServiceTest extends TestCase
{
    private DocumentCapabilityService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new DocumentCapabilityService;
    }

    public function test_tax_form_with_file_has_view_and_download(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_TAX_FORM;
        $document->s3_path = 'tax_docs/1/test.pdf';
        $document->genai_status = 'completed';
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('view_original', $caps);
        $this->assertContains('download_original', $caps);
        $this->assertNotContains('delete', $caps);
        $this->assertContains('open_tax_document', $caps);
        $this->assertContains('open_tax_reconciliation', $caps);
        $this->assertNotContains('reprocess', $caps);
        $this->assertNotContains('review_parsed_data', $caps);
        $this->assertNotContains('resolve_accounts', $caps);
    }

    public function test_tax_form_without_file_has_no_view_or_download(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_TAX_FORM;
        $document->s3_path = null;
        $document->genai_status = 'completed';
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertNotContains('view_original', $caps);
        $this->assertNotContains('download_original', $caps);
        $this->assertNotContains('delete', $caps);
    }

    public function test_tax_form_pending_genai_has_reprocess(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_TAX_FORM;
        $document->s3_path = 'tax_docs/1/test.pdf';
        $document->genai_status = 'pending';
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('reprocess', $caps);
    }

    public function test_tax_form_needs_review_has_review_capability(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_TAX_FORM;
        $document->s3_path = 'tax_docs/1/test.pdf';
        $document->genai_status = 'completed';
        $document->parsed_data_needs_review = true;
        $document->setRelation('accounts', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('review_parsed_data', $caps);
    }

    public function test_tax_form_with_missing_account_has_resolve(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_TAX_FORM;
        $document->s3_path = 'tax_docs/1/test.pdf';
        $document->genai_status = 'completed';
        $document->parsed_data_needs_review = false;

        $mockLink = new FinDocumentAccount;
        $mockLink->account_id = null;
        $document->setRelation('accounts', collect([$mockLink]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('resolve_accounts', $caps);
    }

    public function test_statement_with_file_has_expected_caps(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_STATEMENT;
        $document->s3_path = 'fin_documents/1/statement/test.pdf';
        $document->genai_status = 'completed';
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));
        $document->setRelation('lots', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('view_original', $caps);
        $this->assertContains('download_original', $caps);
        $this->assertContains('delete', $caps);
        $this->assertContains('open_statement', $caps);
        $this->assertNotContains('open_lot_workspace', $caps);
    }

    public function test_statement_with_lots_has_lot_workspace(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_STATEMENT;
        $document->s3_path = 'fin_documents/1/statement/test.pdf';
        $document->genai_status = 'completed';
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));

        $mockLot = new FinAccountLot;
        $document->setRelation('lots', collect([$mockLot]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('open_lot_workspace', $caps);
    }

    public function test_csv_import_has_rollback_and_reimport(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_CSV_IMPORT;
        $document->s3_path = null;
        $document->genai_status = null;
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));
        $document->setRelation('lots', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('delete', $caps);
        $this->assertContains('rollback_import', $caps);
        $this->assertContains('reimport_statement', $caps);
    }

    public function test_json_import_has_rollback_and_reimport(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_JSON_IMPORT;
        $document->s3_path = null;
        $document->genai_status = null;
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));
        $document->setRelation('lots', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('delete', $caps);
        $this->assertContains('rollback_import', $caps);
        $this->assertContains('reimport_statement', $caps);
    }

    public function test_toon_import_has_rollback_and_reimport(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_TOON_IMPORT;
        $document->s3_path = 'fin_documents/1/toon_import/test.toon';
        $document->genai_status = null;
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));
        $document->setRelation('lots', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('view_original', $caps);
        $this->assertContains('download_original', $caps);
        $this->assertContains('delete', $caps);
        $this->assertContains('rollback_import', $caps);
        $this->assertContains('reimport_statement', $caps);
    }

    public function test_manual_has_delete_only_base(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_MANUAL;
        $document->s3_path = null;
        $document->genai_status = null;
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));
        $document->setRelation('lots', collect([]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('delete', $caps);
        $this->assertNotContains('view_original', $caps);
        $this->assertNotContains('download_original', $caps);
        $this->assertNotContains('rollback_import', $caps);
        $this->assertNotContains('reimport_statement', $caps);
        $this->assertNotContains('open_statement', $caps);
        $this->assertNotContains('open_tax_document', $caps);
    }

    public function test_manual_with_lots_has_lot_workspace(): void
    {
        $document = new FinDocument;
        $document->document_kind = FinDocument::KIND_MANUAL;
        $document->s3_path = null;
        $document->genai_status = null;
        $document->parsed_data_needs_review = false;
        $document->setRelation('accounts', collect([]));

        $mockLot = new FinAccountLot;
        $document->setRelation('lots', collect([$mockLot]));

        $caps = $this->service->capabilities($document);

        $this->assertContains('open_lot_workspace', $caps);
    }
}
