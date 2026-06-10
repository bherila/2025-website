<?php

use App\GenAiProcessor\Http\Controllers\AdminGenAiJobsController;
use App\GenAiProcessor\Http\Controllers\GenAiImportController;
use App\Http\Controllers\AdminTaxNormalizationController;
use App\Http\Controllers\Api\UserAiConfigurationController;
use App\Http\Controllers\Api\UserAiModelsController;
use App\Http\Controllers\ClassActionClaimController;
use App\Http\Controllers\ClientManagement\ClientAgreementApiController;
use App\Http\Controllers\ClientManagement\ClientAgreementRecurringItemApiController;
use App\Http\Controllers\ClientManagement\ClientCompanyApiController;
use App\Http\Controllers\ClientManagement\ClientCompanyUserController;
use App\Http\Controllers\ClientManagement\ClientExpenseApiController;
use App\Http\Controllers\ClientManagement\ClientInvoiceApiController;
use App\Http\Controllers\ClientManagement\ClientInvoicePaymentIntentApiController;
use App\Http\Controllers\ClientManagement\ClientPaymentMethodApiController;
use App\Http\Controllers\ClientManagement\ClientPortalAgreementApiController;
use App\Http\Controllers\ClientManagement\ClientPortalApiController;
use App\Http\Controllers\ClientManagement\ClientPortalProposalApiController;
use App\Http\Controllers\ClientManagement\ClientProposalApiController;
use App\Http\Controllers\ClientManagement\StripeWebhookController;
use App\Http\Controllers\FileController;
use App\Http\Controllers\Finance\PalCarryforwardController;
use App\Http\Controllers\Finance\ReadinessSummaryController;
use App\Http\Controllers\Finance\TaxPreviewDataController;
use App\Http\Controllers\Finance\UserDeductionController;
use App\Http\Controllers\Finance\UserTaxStateController;
use App\Http\Controllers\FinanceTool\AccountSuggestController;
use App\Http\Controllers\FinanceTool\CapitalGainsReconciliationController;
use App\Http\Controllers\FinanceTool\CareerCompXlsxExportController;
use App\Http\Controllers\FinanceTool\EmploymentEntityYearController;
use App\Http\Controllers\FinanceTool\FinanceApiController;
use App\Http\Controllers\FinanceTool\FinanceDocumentController;
use App\Http\Controllers\FinanceTool\FinanceEmploymentEntityController;
use App\Http\Controllers\FinanceTool\FinanceFeesController;
use App\Http\Controllers\FinanceTool\FinanceLotsController;
use App\Http\Controllers\FinanceTool\FinancePayslipController;
use App\Http\Controllers\FinanceTool\FinancePayslipImportController;
use App\Http\Controllers\FinanceTool\FinanceRsuController;
use App\Http\Controllers\FinanceTool\FinanceRulesApiController;
use App\Http\Controllers\FinanceTool\FinanceScheduleCController;
use App\Http\Controllers\FinanceTool\FinanceTransactionLinkingApiController;
use App\Http\Controllers\FinanceTool\FinanceTransactionsApiController;
use App\Http\Controllers\FinanceTool\FinanceTransactionsDedupeApiController;
use App\Http\Controllers\FinanceTool\FinanceTransactionTaggingApiController;
use App\Http\Controllers\FinanceTool\Form8829InputController;
use App\Http\Controllers\FinanceTool\Form8949LotExportController;
use App\Http\Controllers\FinanceTool\LotReconciliationLinkController;
use App\Http\Controllers\FinanceTool\LotWorkspaceController;
use App\Http\Controllers\FinanceTool\PartnershipBasisController;
use App\Http\Controllers\FinanceTool\ReconciliationSummaryController;
use App\Http\Controllers\FinanceTool\ScheduleDCarryoverInputController;
use App\Http\Controllers\FinanceTool\StatementController;
use App\Http\Controllers\FinanceTool\TaxDocumentAccountBulkUpdateController;
use App\Http\Controllers\FinanceTool\TaxDocumentController;
use App\Http\Controllers\FinanceTool\TaxDocumentLotMatchRunController;
use App\Http\Controllers\FinanceTool\TaxDocumentLotReconciliationController;
use App\Http\Controllers\FinanceTool\TaxDocumentLotsMatchController;
use App\Http\Controllers\FinanceTool\TaxDocumentLotsRebuildController;
use App\Http\Controllers\FinanceTool\TaxLineAdjustmentController;
use App\Http\Controllers\FinanceTool\TaxPreviewExportController;
use App\Http\Controllers\FinanceTool\TaxYearLotsMatchController;
use App\Http\Controllers\FinancialPlanning\CareerCompController;
use App\Http\Controllers\FinancialPlanning\RothConversionController;
use App\Http\Controllers\LicenseKeyController;
use App\Http\Controllers\LoginAuditController;
use App\Http\Controllers\MD\MarkdownRendererController;
use App\Http\Controllers\PHR\AllergyController as PHRAllergyController;
use App\Http\Controllers\PHR\ConditionController as PHRConditionController;
use App\Http\Controllers\PHR\DICOM\DicomFileController as PHRDicomFileController;
use App\Http\Controllers\PHR\DICOM\DicomStudyController as PHRDicomStudyController;
use App\Http\Controllers\PHR\DICOM\DicomUploadController as PHRDicomUploadController;
use App\Http\Controllers\PHR\ImmunizationController as PHRImmunizationController;
use App\Http\Controllers\PHR\LabResultController as PHRLabResultController;
use App\Http\Controllers\PHR\MedicationController as PHRMedicationController;
use App\Http\Controllers\PHR\OfficeVisitController as PHROfficeVisitController;
use App\Http\Controllers\PHR\PatientAccessController as PHRPatientAccessController;
use App\Http\Controllers\PHR\PatientController as PHRPatientController;
use App\Http\Controllers\PHR\PhrDocumentController;
use App\Http\Controllers\PHR\PhrExportController;
use App\Http\Controllers\PHR\PhrGenAiImportController;
use App\Http\Controllers\PHR\ProcedureController as PHRProcedureController;
use App\Http\Controllers\PHR\VitalController as PHRVitalController;
use App\Http\Controllers\Toon\ToonConverterController;
use App\Http\Controllers\UserApiController;
use App\Http\Controllers\UserManagementApiController;
use App\Http\Controllers\UtilityBillTracker\UtilityAccountApiController;
use App\Http\Controllers\UtilityBillTracker\UtilityBillApiController;
use App\Http\Controllers\UtilityBillTracker\UtilityBillImportController;
use App\Http\Controllers\UtilityBillTracker\UtilityBillLinkingController;
use App\Http\Controllers\Webhooks\BrevoInboundController;
use App\Http\Middleware\AuthenticateWebOrMcpRequest;
use Illuminate\Support\Facades\Route;

Route::post('/webhooks/stripe', StripeWebhookController::class);
Route::post('/webhooks/brevo/inbound', [BrevoInboundController::class, 'handle']);

Route::middleware(['web', 'throttle:60,1'])->post('/financial-planning/roth-conversion/compute', [RothConversionController::class, 'compute']);
Route::middleware(['web', 'throttle:60,1'])->post('/financial-planning/career-comparison/compute', [CareerCompController::class, 'compute']);
Route::middleware(['web', 'auth'])->post('/financial-planning/roth-conversion/save', [RothConversionController::class, 'store']);
Route::middleware(['web', 'auth'])->patch('/financial-planning/roth-conversion/s/{code}', [RothConversionController::class, 'update']);
Route::middleware(['web', AuthenticateWebOrMcpRequest::class])->prefix('/financial-planning/career-comparison/latest')->group(function (): void {
    Route::get('/', [CareerCompController::class, 'latest']);
    Route::put('/', [CareerCompController::class, 'saveLatest']);
    Route::post('/import-rsu', [CareerCompController::class, 'importRsu'])->middleware('feature:finance.rsu.view');
});
// Creating/managing a share requires an owner; editing a fork is open to anyone with the link.
Route::middleware(['web', AuthenticateWebOrMcpRequest::class])->post('/financial-planning/career-comparison/share', [CareerCompController::class, 'share']);
Route::middleware(['web', 'throttle:60,1'])->put('/financial-planning/career-comparison/s/{code}', [CareerCompController::class, 'saveShare']);
Route::middleware(['web', AuthenticateWebOrMcpRequest::class])->patch('/financial-planning/career-comparison/s/{code}', [CareerCompController::class, 'updateShare']);
Route::middleware(['web', AuthenticateWebOrMcpRequest::class])->delete('/financial-planning/career-comparison/s/{code}', [CareerCompController::class, 'deleteShare']);

Route::middleware(['web', 'auth'])->post('/tools/markdown/save', [MarkdownRendererController::class, 'store']);
Route::middleware(['web', 'auth'])->patch('/tools/markdown/s/{code}', [MarkdownRendererController::class, 'update']);

Route::middleware(['web', 'auth'])->post('/tools/toon-json/save', [ToonConverterController::class, 'store']);
Route::middleware(['web', 'auth'])->patch('/tools/toon-json/s/{code}', [ToonConverterController::class, 'update']);

Route::middleware(['web', 'auth', 'feature:finance.accounts.basic'])->get('/finance/accounts/basic', [FinanceApiController::class, 'basicAccounts']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/accounts', [FinanceApiController::class, 'accounts']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.basic'])->get('/finance/accounts/suggest', [AccountSuggestController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts', [FinanceApiController::class, 'createAccount']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/balance', [FinanceApiController::class, 'updateBalance']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/accounts/{account}/basis', [PartnershipBasisController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/initialization', [PartnershipBasisController::class, 'initialize']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->put('/finance/accounts/{account}/basis/interests/{interest}', [PartnershipBasisController::class, 'updateInterest']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/events', [PartnershipBasisController::class, 'storeEvent']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->put('/finance/accounts/{account}/basis/events/{event}', [PartnershipBasisController::class, 'updateEvent']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/recompute', [PartnershipBasisController::class, 'recompute']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/lock', [PartnershipBasisController::class, 'lock']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/unlock', [PartnershipBasisController::class, 'unlock']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/reconciliation/accept', [PartnershipBasisController::class, 'acceptReconciliation']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/accounts/{account}/basis/reconciliation/seed', [PartnershipBasisController::class, 'seedReconciliation']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/chart', [FinanceApiController::class, 'chartData']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/rsu', [FinanceRsuController::class, 'getRsuData']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/backfill-vest-prices', [FinanceRsuController::class, 'backfillVestPrices']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/rsu/settlements', [FinanceRsuController::class, 'settlements']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/settlements/suggest', [FinanceRsuController::class, 'suggestSettlements']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/settlements/{settlement}/confirm', [FinanceRsuController::class, 'confirmSettlement']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->put('/rsu/settlements/{settlement}', [FinanceRsuController::class, 'updateSettlement']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/settlements/{settlement}/ignore', [FinanceRsuController::class, 'ignoreSettlement']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/rsu/settlements/{settlement}/links', [FinanceRsuController::class, 'settlementLinks']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/rsu/settlements/{settlement}/candidates', [FinanceRsuController::class, 'settlementCandidates']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/settlements/{settlement}/links', [FinanceRsuController::class, 'createSettlementLink']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->delete('/rsu/links/{link}', [FinanceRsuController::class, 'deleteRsuLink']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/rsu/tax-projection', [FinanceRsuController::class, 'taxProjection']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/finance/transactions/{transaction}/rsu-links', [FinanceRsuController::class, 'transactionRsuLinks']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.view'])->get('/payslips/{payslip}/rsu-links', [FinanceRsuController::class, 'payslipRsuLinks']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu', [FinanceRsuController::class, 'upsertRsuGrants']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->delete('/rsu/{id}', [FinanceRsuController::class, 'deleteRsuGrant']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/genai-import/{jobId}/results/{resultId}/confirm', [FinanceRsuController::class, 'confirmGenAiImport']);
Route::middleware(['web', 'auth', 'feature:finance.rsu.manage'])->post('/rsu/genai-import/{jobId}/results/{resultId}/skip', [FinanceRsuController::class, 'skipGenAiImport']);

// Transaction routes (FinanceTransactionsApiController)
// /finance/all/... routes must come before /finance/{account_id}/... to avoid conflicts
Route::middleware(['web', 'auth', 'feature:finance.lots.view,finance.transactions.view'])->get('/finance/all-line-items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/all/fees', [FinanceFeesController::class, 'all']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/all/line_items/sync', [FinanceTransactionsApiController::class, 'syncLineItems']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/all/line_items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/all/transaction-years', [FinanceTransactionsApiController::class, 'getTransactionYears']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/{account_id}/line_items/sync', [FinanceTransactionsApiController::class, 'syncLineItems']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.import'])->post('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'importLineItems']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/{account_id}/transaction', [FinanceTransactionsApiController::class, 'createTransaction']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->delete('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'deleteLineItem']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/{account_id}/transaction-years', [FinanceTransactionsApiController::class, 'getTransactionYears']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/tags', [FinanceTransactionTaggingApiController::class, 'getUserTags']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/tags/apply', [FinanceTransactionTaggingApiController::class, 'applyTagToTransactions']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/tags/remove', [FinanceTransactionTaggingApiController::class, 'removeTagsFromTransactions']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->post('/finance/tags', [FinanceTransactionTaggingApiController::class, 'createTag']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->put('/finance/tags/{tag_id}', [FinanceTransactionTaggingApiController::class, 'updateTag']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->delete('/finance/tags/{tag_id}', [FinanceTransactionTaggingApiController::class, 'deleteTag']);

// Finance Rules Engine
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->get('/finance/rules', [FinanceRulesApiController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->post('/finance/rules', [FinanceRulesApiController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->put('/finance/rules/{id}', [FinanceRulesApiController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->delete('/finance/rules/{id}', [FinanceRulesApiController::class, 'destroy']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->post('/finance/rules/reorder', [FinanceRulesApiController::class, 'reorder']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->post('/finance/rules/{id}/run', [FinanceRulesApiController::class, 'runNow']);
Route::middleware(['web', 'auth', 'feature:finance.rules.manage'])->post('/finance/rules/preview-matches', [FinanceRulesApiController::class, 'previewMatches']);

Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/documents', [FinanceDocumentController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/documents/summary', [FinanceDocumentController::class, 'summary']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/documents/{id}', [FinanceDocumentController::class, 'show'])->where('id', '[0-9]+');
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/documents/{id}/download', [FinanceDocumentController::class, 'download'])->where('id', '[0-9]+');
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/documents/{id}/impact-preview', [FinanceDocumentController::class, 'impactPreview'])->where('id', '[0-9]+');
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->delete('/finance/documents/{id}', [FinanceDocumentController::class, 'destroy'])->where('id', '[0-9]+');
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/documents/request-upload', [FinanceDocumentController::class, 'requestUpload']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/documents', [FinanceDocumentController::class, 'store']);

Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/schedule-c', [FinanceScheduleCController::class, 'getSummary']);

// Employment Entity routes
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/employment-entities', [FinanceEmploymentEntityController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/employment-entities', [FinanceEmploymentEntityController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/employment-entities/{id}', [FinanceEmploymentEntityController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/employment-entities/{id}', [FinanceEmploymentEntityController::class, 'destroy']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/employment-entities/{id}/years', [EmploymentEntityYearController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/employment-entities/{id}/years', [EmploymentEntityYearController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/employment-entities/{id}/years/{year}', [EmploymentEntityYearController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/employment-entities/{id}/years/{year}', [EmploymentEntityYearController::class, 'destroy']);

Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/form-8829', [Form8829InputController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/form-8829', [Form8829InputController::class, 'upsert']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/schedule-d-carryovers', [ScheduleDCarryoverInputController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/schedule-d-carryovers', [ScheduleDCarryoverInputController::class, 'upsert']);

Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/tax-line-adjustments', [TaxLineAdjustmentController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/tax-line-adjustments', [TaxLineAdjustmentController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->patch('/finance/tax-line-adjustments/{id}', [TaxLineAdjustmentController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/tax-line-adjustments/{id}', [TaxLineAdjustmentController::class, 'destroy']);

// Marriage status routes
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/marriage-status', [FinanceEmploymentEntityController::class, 'getMarriageStatus']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/marriage-status', [FinanceEmploymentEntityController::class, 'updateMarriageStatus']);

// Per-year active state filings
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/user-tax-states', [UserTaxStateController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/user-tax-states', [UserTaxStateController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/user-tax-states/{stateCode}', [UserTaxStateController::class, 'destroy']);

// Per-year user-entered deductions (Schedule A: SALT, mortgage, charitable, etc.)
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/user-deductions', [UserDeductionController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/user-deductions', [UserDeductionController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/user-deductions/{id}', [UserDeductionController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/user-deductions/{id}', [UserDeductionController::class, 'destroy']);

// Per-year per-activity PAL carryforwards (Form 8582 suspended losses from prior years)
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/pal-carryforwards', [PalCarryforwardController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/pal-carryforwards', [PalCarryforwardController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/pal-carryforwards/{id}', [PalCarryforwardController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/pal-carryforwards/{id}', [PalCarryforwardController::class, 'destroy']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/tax-loss-carryforwards', [PalCarryforwardController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->post('/finance/tax-loss-carryforwards', [PalCarryforwardController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->put('/finance/tax-loss-carryforwards/{id}', [PalCarryforwardController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.manage'])->delete('/finance/tax-loss-carryforwards/{id}', [PalCarryforwardController::class, 'destroy']);

Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/transactions/batch-delete', [FinanceTransactionsApiController::class, 'batchDelete']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/transactions/batch-update', [FinanceTransactionsApiController::class, 'batchUpdate']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/transactions/{transaction_id}/links', [FinanceTransactionLinkingApiController::class, 'getTransactionLinks']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/transactions/{transaction_id}/linkable', [FinanceTransactionLinkingApiController::class, 'findLinkableTransactions']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/transactions/link', [FinanceTransactionLinkingApiController::class, 'linkTransactions']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/transactions/{transaction_id}/unlink', [FinanceTransactionLinkingApiController::class, 'unlinkTransaction']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/{account_id}/linkable-pairs', [FinanceTransactionLinkingApiController::class, 'findLinkablePairs']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/{account_id}/fees', [FinanceFeesController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'getBalanceTimeseries']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/{account_id}/summary', [FinanceApiController::class, 'getSummary']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/{account_id}/balance-timeseries', [StatementController::class, 'addFinAccountStatement']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->delete('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'deleteBalanceSnapshot']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->put('/finance/balance-timeseries/{statement_id}', [StatementController::class, 'updateFinAccountStatement']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/{account_id}/rename', [FinanceApiController::class, 'renameAccount']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/{account_id}/update-closed', [FinanceApiController::class, 'updateAccountClosed']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->post('/finance/{account_id}/update-flags', [FinanceApiController::class, 'updateAccountFlags']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.manage'])->delete('/finance/{account_id}', [FinanceApiController::class, 'deleteAccount']);

Route::middleware(['web', 'auth', 'feature:finance.payslips.view'])->get('/payslips/years', [FinancePayslipController::class, 'fetchPayslipYears']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.view'])->get('/payslips/prompt', [FinancePayslipController::class, 'getPrompt']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.view'])->get('/payslips', [FinancePayslipController::class, 'fetchPayslips']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips', [FinancePayslipController::class, 'savePayslip']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips/bulk', [FinancePayslipController::class, 'bulkSave']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips/genai-import/{jobId}/results/{resultId}/confirm', [FinancePayslipImportController::class, 'confirm']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips/genai-import/{jobId}/results/{resultId}/skip', [FinancePayslipImportController::class, 'skip']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->delete('/payslips/{payslip_id}', [FinancePayslipController::class, 'deletePayslip']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.view'])->get('/payslips/{payslip_id}', [FinancePayslipController::class, 'fetchPayslipById']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips/{payslip_id}/estimated-status', [FinancePayslipController::class, 'updatePayslipEstimatedStatus']);
// Deposits sub-resource
Route::middleware(['web', 'auth', 'feature:finance.payslips.view'])->get('/payslips/{payslip_id}/deposits', [FinancePayslipController::class, 'fetchDeposits']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips/{payslip_id}/deposits', [FinancePayslipController::class, 'saveDeposit']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->delete('/payslips/{payslip_id}/deposits/{deposit_id}', [FinancePayslipController::class, 'deleteDeposit']);
// State data sub-resource
Route::middleware(['web', 'auth', 'feature:finance.payslips.view'])->get('/payslips/{payslip_id}/state-data', [FinancePayslipController::class, 'fetchStateData']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->post('/payslips/{payslip_id}/state-data', [FinancePayslipController::class, 'saveStateData']);
Route::middleware(['web', 'auth', 'feature:finance.payslips.manage'])->delete('/payslips/{payslip_id}/state-data/{state_data_id}', [FinancePayslipController::class, 'deleteStateData']);

Route::middleware(['web', 'auth'])->get('/user', [UserApiController::class, 'getUser']);

Route::middleware(['web', 'auth'])
    ->apiResource('class-action-claims', ClassActionClaimController::class);

Route::middleware(['web', 'auth'])->get('/license-keys', [LicenseKeyController::class, 'index']);
Route::middleware(['web', 'auth'])->put('/license-keys/{id}', [LicenseKeyController::class, 'update']);
Route::middleware(['web', 'auth'])->delete('/license-keys/{id}', [LicenseKeyController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/license-keys', [LicenseKeyController::class, 'store']);
Route::middleware(['web', 'auth'])->post('/license-keys/import', [LicenseKeyController::class, 'import']);
Route::middleware(['web', 'auth'])->post('/user/update-email', [UserApiController::class, 'updateEmail']);
Route::middleware(['web', 'auth'])->post('/user/update-password', [UserApiController::class, 'updatePassword']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/statement/{statement_id}/details', [StatementController::class, 'getDetails']);
Route::middleware(['web', 'auth', 'feature:finance.accounts.detail'])->get('/finance/{account_id}/all-statement-details', [StatementController::class, 'getFinStatementDetails']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.import'])->post('/finance/{account_id}/import-ib-statement', [StatementController::class, 'importIbStatement']);

// Lots API routes
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/lot-workspace', [LotWorkspaceController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/all/lots', [FinanceLotsController::class, 'showAllLots']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->post('/finance/lots/export-txf', [Form8949LotExportController::class, 'txf']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->post('/finance/lots/export-olt-xlsx', [Form8949LotExportController::class, 'oltXlsx']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/lots/reconciliation', [FinanceLotsController::class, 'reconciliation']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/{account_id}/lots/reconciliation', [FinanceLotsController::class, 'accountReconciliation']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->post('/finance/{account_id}/lots/reconciliation/apply', [FinanceLotsController::class, 'applyReconciliation']);

// Capital Gains Reconciliation — shared engine endpoints
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/capital-gains/reconciliation', [CapitalGainsReconciliationController::class, 'reconciliation']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/capital-gains/wash-sales', [CapitalGainsReconciliationController::class, 'washSales']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/capital-gains/form-8949', [CapitalGainsReconciliationController::class, 'form8949']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/{account_id}/lots', [FinanceLotsController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->post('/finance/{account_id}/lots', [FinanceLotsController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->post('/finance/{account_id}/lots/import', [FinanceLotsController::class, 'importLots']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->post('/finance/{account_id}/lots/save-analyzed', [FinanceLotsController::class, 'saveAnalyzedLots']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->put('/finance/{account_id}/lots/{lot_id}', [FinanceLotsController::class, 'updateLot']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->delete('/finance/{account_id}/lots/{lot_id}', [FinanceLotsController::class, 'deleteLot']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->post('/finance/{account_id}/lots/search-transactions', [FinanceLotsController::class, 'searchTransactions']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->get('/finance/{account_id}/lots/by-transaction/{t_id}', [FinanceLotsController::class, 'lotsByTransaction']);
Route::middleware(['web', 'auth', 'feature:finance.lots.view'])->post('/finance/lots/search-opening', [FinanceLotsController::class, 'searchOpeningTransactions']);
Route::middleware(['web', 'auth', 'feature:finance.lots.manage'])->post('/finance/lots/save-assignment', [FinanceLotsController::class, 'saveLotAssignment']);

Route::middleware(['web', 'auth'])->post('/user/update-api-key', [UserApiController::class, 'updateApiKey']);
Route::middleware(['web', 'auth'])->post('/user/update-genai-quota', [UserApiController::class, 'updateGenAiQuota']);
Route::middleware(['web', 'auth'])->post('/user/generate-mcp-api-key', [UserApiController::class, 'generateMcpApiKey']);

// AI configuration routes
Route::middleware(['web', 'auth'])->group(function () {
    Route::get('/user/ai-prefs', [UserAiConfigurationController::class, 'index']);
    Route::post('/user/ai-prefs', [UserAiConfigurationController::class, 'store']);
    Route::put('/user/ai-prefs/{id}', [UserAiConfigurationController::class, 'update']);
    Route::delete('/user/ai-prefs/{id}', [UserAiConfigurationController::class, 'destroy']);
    Route::post('/user/ai-prefs/{id}/activate', [UserAiConfigurationController::class, 'activate']);
    Route::post('/user/ai-prefs/models', [UserAiModelsController::class, 'fetch']);
});

Route::middleware(['web', 'auth'])
    ->prefix('phr')
    ->name('phr.')
    ->group(function (): void {
        Route::get('/patients', [PHRPatientController::class, 'index'])->name('patients.index');
        Route::post('/patients', [PHRPatientController::class, 'store'])->name('patients.store');
        Route::get('/patients/{patient}', [PHRPatientController::class, 'show'])->whereNumber('patient')->name('patients.show');
        Route::patch('/patients/{patient}', [PHRPatientController::class, 'update'])->whereNumber('patient')->name('patients.update');
        Route::delete('/patients/{patient}', [PHRPatientController::class, 'destroy'])->whereNumber('patient')->name('patients.destroy');
        Route::get('/patients/{patient}/lab-results', [PHRLabResultController::class, 'index'])->whereNumber('patient')->name('patients.lab-results.index');
        Route::post('/patients/{patient}/lab-results', [PHRLabResultController::class, 'store'])->whereNumber('patient')->name('patients.lab-results.store');
        Route::get('/patients/{patient}/lab-results/{labResult}', [PHRLabResultController::class, 'show'])->whereNumber(['patient', 'labResult'])->name('patients.lab-results.show');
        Route::get('/patients/{patient}/labs/{labResult}', [PHRLabResultController::class, 'showPanel'])->whereNumber(['patient', 'labResult'])->name('patients.labs.show');
        Route::patch('/patients/{patient}/lab-results/{labResult}', [PHRLabResultController::class, 'update'])->whereNumber(['patient', 'labResult'])->name('patients.lab-results.update');
        Route::delete('/patients/{patient}/lab-results/{labResult}', [PHRLabResultController::class, 'destroy'])->whereNumber(['patient', 'labResult'])->name('patients.lab-results.destroy');
        Route::get('/patients/{patient}/vitals', [PHRVitalController::class, 'index'])->whereNumber('patient')->name('patients.vitals.index');
        Route::post('/patients/{patient}/vitals', [PHRVitalController::class, 'store'])->whereNumber('patient')->name('patients.vitals.store');
        Route::get('/patients/{patient}/vitals/trend/{metricKey}', [PHRVitalController::class, 'trend'])->whereNumber('patient')->name('patients.vitals.trend');
        Route::get('/patients/{patient}/vitals/{vital}', [PHRVitalController::class, 'show'])->whereNumber(['patient', 'vital'])->name('patients.vitals.show');
        Route::patch('/patients/{patient}/vitals/{vital}', [PHRVitalController::class, 'update'])->whereNumber(['patient', 'vital'])->name('patients.vitals.update');
        Route::delete('/patients/{patient}/vitals/{vital}', [PHRVitalController::class, 'destroy'])->whereNumber(['patient', 'vital'])->name('patients.vitals.destroy');
        Route::post('/patients/{patient}/access', [PHRPatientAccessController::class, 'store'])->whereNumber('patient')->name('patients.access.store');
        Route::delete('/patients/{patient}/access/{access}', [PHRPatientAccessController::class, 'destroy'])->whereNumber(['patient', 'access'])->name('patients.access.destroy');
        Route::get('/patients/{patient}/office-visits', [PHROfficeVisitController::class, 'index'])->whereNumber('patient')->name('patients.office-visits.index');
        Route::post('/patients/{patient}/office-visits', [PHROfficeVisitController::class, 'store'])->whereNumber('patient')->name('patients.office-visits.store');
        Route::get('/patients/{patient}/office-visits/{visit}', [PHROfficeVisitController::class, 'show'])->whereNumber(['patient', 'visit'])->name('patients.office-visits.show');
        Route::patch('/patients/{patient}/office-visits/{visit}', [PHROfficeVisitController::class, 'update'])->whereNumber(['patient', 'visit'])->name('patients.office-visits.update');
        Route::delete('/patients/{patient}/office-visits/{visit}', [PHROfficeVisitController::class, 'destroy'])->whereNumber(['patient', 'visit'])->name('patients.office-visits.destroy');
        Route::get('/patients/{patient}/medications', [PHRMedicationController::class, 'index'])->whereNumber('patient')->name('patients.medications.index');
        Route::post('/patients/{patient}/medications', [PHRMedicationController::class, 'store'])->whereNumber('patient')->name('patients.medications.store');
        Route::get('/patients/{patient}/medications/{medication}', [PHRMedicationController::class, 'show'])->whereNumber(['patient', 'medication'])->name('patients.medications.show');
        Route::patch('/patients/{patient}/medications/{medication}', [PHRMedicationController::class, 'update'])->whereNumber(['patient', 'medication'])->name('patients.medications.update');
        Route::delete('/patients/{patient}/medications/{medication}', [PHRMedicationController::class, 'destroy'])->whereNumber(['patient', 'medication'])->name('patients.medications.destroy');
        Route::get('/patients/{patient}/conditions', [PHRConditionController::class, 'index'])->whereNumber('patient')->name('patients.conditions.index');
        Route::post('/patients/{patient}/conditions', [PHRConditionController::class, 'store'])->whereNumber('patient')->name('patients.conditions.store');
        Route::get('/patients/{patient}/conditions/{condition}', [PHRConditionController::class, 'show'])->whereNumber(['patient', 'condition'])->name('patients.conditions.show');
        Route::patch('/patients/{patient}/conditions/{condition}', [PHRConditionController::class, 'update'])->whereNumber(['patient', 'condition'])->name('patients.conditions.update');
        Route::delete('/patients/{patient}/conditions/{condition}', [PHRConditionController::class, 'destroy'])->whereNumber(['patient', 'condition'])->name('patients.conditions.destroy');
        Route::get('/patients/{patient}/procedures', [PHRProcedureController::class, 'index'])->whereNumber('patient')->name('patients.procedures.index');
        Route::post('/patients/{patient}/procedures', [PHRProcedureController::class, 'store'])->whereNumber('patient')->name('patients.procedures.store');
        Route::get('/patients/{patient}/procedures/{procedure}', [PHRProcedureController::class, 'show'])->whereNumber(['patient', 'procedure'])->name('patients.procedures.show');
        Route::patch('/patients/{patient}/procedures/{procedure}', [PHRProcedureController::class, 'update'])->whereNumber(['patient', 'procedure'])->name('patients.procedures.update');
        Route::delete('/patients/{patient}/procedures/{procedure}', [PHRProcedureController::class, 'destroy'])->whereNumber(['patient', 'procedure'])->name('patients.procedures.destroy');
        Route::get('/patients/{patient}/immunizations', [PHRImmunizationController::class, 'index'])->whereNumber('patient')->name('patients.immunizations.index');
        Route::post('/patients/{patient}/immunizations', [PHRImmunizationController::class, 'store'])->whereNumber('patient')->name('patients.immunizations.store');
        Route::get('/patients/{patient}/immunizations/{immunization}', [PHRImmunizationController::class, 'show'])->whereNumber(['patient', 'immunization'])->name('patients.immunizations.show');
        Route::patch('/patients/{patient}/immunizations/{immunization}', [PHRImmunizationController::class, 'update'])->whereNumber(['patient', 'immunization'])->name('patients.immunizations.update');
        Route::delete('/patients/{patient}/immunizations/{immunization}', [PHRImmunizationController::class, 'destroy'])->whereNumber(['patient', 'immunization'])->name('patients.immunizations.destroy');
        Route::get('/patients/{patient}/allergies', [PHRAllergyController::class, 'index'])->whereNumber('patient')->name('patients.allergies.index');
        Route::post('/patients/{patient}/allergies', [PHRAllergyController::class, 'store'])->whereNumber('patient')->name('patients.allergies.store');
        Route::get('/patients/{patient}/allergies/{allergy}', [PHRAllergyController::class, 'show'])->whereNumber(['patient', 'allergy'])->name('patients.allergies.show');
        Route::patch('/patients/{patient}/allergies/{allergy}', [PHRAllergyController::class, 'update'])->whereNumber(['patient', 'allergy'])->name('patients.allergies.update');
        Route::delete('/patients/{patient}/allergies/{allergy}', [PHRAllergyController::class, 'destroy'])->whereNumber(['patient', 'allergy'])->name('patients.allergies.destroy');
        Route::get('/patients/{patient}/dicom/studies', [PHRDicomStudyController::class, 'index'])->whereNumber('patient')->name('patients.dicom.studies.index');
        Route::get('/patients/{patient}/dicom/studies/{study}', [PHRDicomStudyController::class, 'show'])->whereNumber(['patient', 'study'])->name('patients.dicom.studies.show');
        Route::post('/patients/{patient}/dicom/uploads', [PHRDicomUploadController::class, 'open'])->whereNumber('patient')->name('patients.dicom.uploads.open');
        Route::post('/patients/{patient}/dicom/uploads/{upload}/signed-url', [PHRDicomUploadController::class, 'requestUploadUrl'])->whereNumber(['patient', 'upload'])->name('patients.dicom.uploads.signed-url');
        Route::post('/patients/{patient}/dicom/uploads/{upload}/signed-urls', [PHRDicomUploadController::class, 'requestUploadUrls'])->whereNumber(['patient', 'upload'])->name('patients.dicom.uploads.signed-urls');
        Route::post('/patients/{patient}/dicom/uploads/{upload}/files', [PHRDicomUploadController::class, 'storeFile'])->whereNumber(['patient', 'upload'])->name('patients.dicom.uploads.files.store');
        Route::post('/patients/{patient}/dicom/uploads/{upload}/files/complete', [PHRDicomUploadController::class, 'completeFile'])->whereNumber(['patient', 'upload'])->name('patients.dicom.uploads.files.complete');
        Route::post('/patients/{patient}/dicom/uploads/{upload}/finalize', [PHRDicomUploadController::class, 'finalize'])->whereNumber(['patient', 'upload'])->name('patients.dicom.uploads.finalize');
        Route::post('/patients/{patient}/dicom/uploads/{upload}/cancel', [PHRDicomUploadController::class, 'cancel'])->whereNumber(['patient', 'upload'])->name('patients.dicom.uploads.cancel');
        Route::get('/patients/{patient}/dicom/studies/{study}/viewer-json', [PHRDicomStudyController::class, 'viewerJson'])->whereNumber(['patient', 'study'])->name('patients.dicom.studies.viewer-json');
        Route::get('/patients/{patient}/dicom/studies/{study}/download', [PHRDicomFileController::class, 'downloadStudy'])->whereNumber(['patient', 'study'])->name('patients.dicom.studies.download');
        Route::get('/patients/{patient}/dicom/instances/{instance}/file', [PHRDicomFileController::class, 'proxyInstanceFile'])->whereNumber(['patient', 'instance'])->name('patients.dicom.instances.file');
        Route::get('/patients/{patient}/documents', [PhrDocumentController::class, 'index'])->whereNumber('patient')->name('patients.documents.index');
        Route::post('/patients/{patient}/documents', [PhrDocumentController::class, 'store'])->whereNumber('patient')->name('patients.documents.store');
        Route::get('/patients/{patient}/documents/{document}', [PhrDocumentController::class, 'show'])->whereNumber(['patient', 'document'])->name('patients.documents.show');
        Route::get('/patients/{patient}/documents/{document}/file', [PhrDocumentController::class, 'file'])->whereNumber(['patient', 'document'])->name('patients.documents.file');
        Route::patch('/patients/{patient}/documents/{document}', [PhrDocumentController::class, 'update'])->whereNumber(['patient', 'document'])->name('patients.documents.update');
        Route::delete('/patients/{patient}/documents/{document}', [PhrDocumentController::class, 'destroy'])->whereNumber(['patient', 'document'])->name('patients.documents.destroy');
        Route::post('/patients/{patient}/documents/{document}/process', [PhrDocumentController::class, 'process'])->whereNumber(['patient', 'document'])->name('patients.documents.process');
        Route::get('/patients/{patient}/exports', [PhrExportController::class, 'index'])->whereNumber('patient')->name('patients.exports.index');
        Route::post('/patients/{patient}/exports', [PhrExportController::class, 'store'])->whereNumber('patient')->name('patients.exports.store');
        Route::get('/genai/writable-patients', [PhrGenAiImportController::class, 'writablePatients'])->name('genai.writable-patients');
        Route::post('/genai/jobs/{job}/results/{result}/accept', [PhrGenAiImportController::class, 'accept'])->whereNumber(['job', 'result'])->name('genai.results.accept');
    });

// Login audit log routes
Route::middleware(['web', 'auth'])->get('/login-audit', [LoginAuditController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/login-audit/{id}/suspicious', [LoginAuditController::class, 'markSuspicious']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.view'])->get('/finance/{account_id}/duplicates', [FinanceTransactionsDedupeApiController::class, 'findDuplicates']);
Route::middleware(['web', 'auth', 'feature:finance.transactions.manage'])->post('/finance/{account_id}/merge-duplicates', [FinanceTransactionsDedupeApiController::class, 'mergeDuplicates']);

// Client Management API routes (Admin)
Route::middleware(['web', 'auth', 'can:Admin'])
    ->prefix('client/mgmt')
    ->group(function (): void {
        Route::get('/companies', [ClientCompanyApiController::class, 'index']);
        Route::get('/company-options', [ClientCompanyApiController::class, 'options']);
        Route::get('/companies/{company}/billing-recipients', [ClientCompanyApiController::class, 'billingRecipients']);
        Route::get('/companies/{id}', [ClientCompanyApiController::class, 'show']);
        Route::put('/companies/{id}', [ClientCompanyApiController::class, 'update']);
        Route::get('/users', [ClientCompanyApiController::class, 'getUsers']);
        Route::post('/assign-user', [ClientCompanyUserController::class, 'store']);
        Route::post('/create-user-and-assign', [ClientCompanyApiController::class, 'createUserAndAssign']);
        Route::delete('/{companyId}/users/{userId}', [ClientCompanyUserController::class, 'destroy']);

        // Client Agreement API routes
        Route::get('/companies/{companyId}/agreements', [ClientAgreementApiController::class, 'index']);
        Route::get('/agreements/{id}', [ClientAgreementApiController::class, 'show']);
        Route::put('/agreements/{id}', [ClientAgreementApiController::class, 'update']);
        Route::post('/agreements/{id}/terminate', [ClientAgreementApiController::class, 'terminate']);
        Route::delete('/agreements/{id}', [ClientAgreementApiController::class, 'destroy']);
        Route::post('/companies/{company}/agreements/{agreement}/transition/preview', [ClientAgreementApiController::class, 'transitionPreview']);
        Route::post('/companies/{company}/agreements/{agreement}/transition', [ClientAgreementApiController::class, 'transition']);
        Route::get('/companies/{company}/agreements/{agreement}/recurring-items', [ClientAgreementRecurringItemApiController::class, 'index']);
        Route::post('/companies/{company}/agreements/{agreement}/recurring-items', [ClientAgreementRecurringItemApiController::class, 'store']);
        Route::put('/companies/{company}/agreements/{agreement}/recurring-items/{recurringItem}', [ClientAgreementRecurringItemApiController::class, 'update']);
        Route::delete('/companies/{company}/agreements/{agreement}/recurring-items/{recurringItem}', [ClientAgreementRecurringItemApiController::class, 'destroy']);

        // Client Proposal API routes
        Route::get('/companies/{companyId}/proposals', [ClientProposalApiController::class, 'index']);
        Route::post('/proposals', [ClientProposalApiController::class, 'store']);
        Route::get('/proposals/{id}', [ClientProposalApiController::class, 'show']);
        Route::put('/proposals/{id}', [ClientProposalApiController::class, 'update']);
        Route::delete('/proposals/{id}', [ClientProposalApiController::class, 'destroy']);
        Route::post('/proposals/{id}/send', [ClientProposalApiController::class, 'send']);
        Route::post('/proposals/{id}/revisions', [ClientProposalApiController::class, 'createRevision']);
        Route::get('/proposals/{id}/preview', [ClientProposalApiController::class, 'preview']);

        // Client Invoice API routes
        Route::get('/invoices', [ClientInvoiceApiController::class, 'indexAll']);
        Route::get('/companies/{company}/invoices', [ClientInvoiceApiController::class, 'index']);
        Route::get('/companies/{company}/invoices/{invoice}', [ClientInvoiceApiController::class, 'show']);
        Route::post('/companies/{company}/invoices/{invoice}/send', [ClientInvoiceApiController::class, 'send']);
        Route::get('/companies/{company}/invoices/{invoice}/pdf', [ClientInvoiceApiController::class, 'downloadPdf']);
        Route::post('/companies/{company}/invoices/generate-all', [ClientInvoiceApiController::class, 'generateAll']);
        Route::post('/companies/{company}/invoices/generate-interim/{yyyymm}', [ClientInvoiceApiController::class, 'generateInterim'])->where('yyyymm', '[0-9]{6}');
        Route::post('/companies/{company}/invoices', [ClientInvoiceApiController::class, 'store']);
        Route::put('/companies/{company}/invoices/{invoice}', [ClientInvoiceApiController::class, 'update']);
        Route::post('/companies/{company}/invoices/{invoice}/issue', [ClientInvoiceApiController::class, 'issue']);
        Route::post('/companies/{company}/invoices/{invoice}/mark-paid', [ClientInvoiceApiController::class, 'markPaid']);
        Route::post('/companies/{company}/invoices/{invoice}/void', [ClientInvoiceApiController::class, 'void']);
        Route::post('/companies/{company}/invoices/{invoice}/unvoid', [ClientInvoiceApiController::class, 'unVoid']);
        Route::delete('/companies/{company}/invoices/{invoice}', [ClientInvoiceApiController::class, 'destroy']);
        Route::post('/companies/{company}/invoices/{invoice}/line-items', [ClientInvoiceApiController::class, 'addLineItem']);
        Route::put('/companies/{company}/invoices/{invoice}/line-items/{lineId}', [ClientInvoiceApiController::class, 'updateLineItem']);
        Route::delete('/companies/{company}/invoices/{invoice}/line-items/{lineId}', [ClientInvoiceApiController::class, 'removeLineItem']);

        // Client Invoice Payment API routes
        Route::get('/companies/{company}/invoices/{invoice}/payments', [ClientInvoiceApiController::class, 'getPayments']);
        Route::post('/companies/{company}/invoices/{invoice}/payments', [ClientInvoiceApiController::class, 'addPayment']);
        Route::put('/companies/{company}/invoices/{invoice}/payments/{payment}', [ClientInvoiceApiController::class, 'updatePayment']);
        Route::delete('/companies/{company}/invoices/{invoice}/payments/{payment}', [ClientInvoiceApiController::class, 'deletePayment']);

        // Client Expense API routes
        Route::get('/companies/{company}/expenses', [ClientExpenseApiController::class, 'index']);
        Route::post('/companies/{company}/expenses', [ClientExpenseApiController::class, 'store']);
        Route::get('/companies/{company}/expenses/{expense}', [ClientExpenseApiController::class, 'show']);
        Route::put('/companies/{company}/expenses/{expense}', [ClientExpenseApiController::class, 'update']);
        Route::delete('/companies/{company}/expenses/{expense}', [ClientExpenseApiController::class, 'destroy']);
        Route::post('/companies/{company}/expenses/{expense}/mark-reimbursed', [ClientExpenseApiController::class, 'markReimbursed']);
        Route::post('/companies/{company}/expenses/{expense}/link-finance', [ClientExpenseApiController::class, 'linkToFinanceLineItem']);
        Route::delete('/companies/{company}/expenses/{expense}/link-finance', [ClientExpenseApiController::class, 'unlinkFromFinanceLineItem']);
    });

// Client Portal API routes
Route::middleware(['web', 'auth'])->get('/client/portal/companies', [ClientPortalApiController::class, 'getAccessibleCompanies']);
Route::middleware(['web', 'auth'])->get('/client/portal/companies/{company}/payment-methods', [ClientPaymentMethodApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/client/portal/companies/{company}/payment-methods/setup', [ClientPaymentMethodApiController::class, 'setup']);
Route::middleware(['web', 'auth'])->delete('/client/portal/companies/{company}/payment-methods/{paymentMethod}', [ClientPaymentMethodApiController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/client/portal/companies/{company}/payment-methods/{paymentMethod}/default', [ClientPaymentMethodApiController::class, 'makeDefault']);
Route::middleware(['web', 'auth'])->post('/client/portal/invoices/{invoice}/pay-intent', [ClientInvoicePaymentIntentApiController::class, 'store']);
Route::middleware(['web', 'auth'])->get('/client/portal/invoices/{invoice}/pay-intent/{paymentIntent}', [ClientInvoicePaymentIntentApiController::class, 'show']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}', [ClientPortalApiController::class, 'getCompany']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects', [ClientPortalApiController::class, 'getProjects']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/projects', [ClientPortalApiController::class, 'createProject']);
Route::middleware(['web', 'auth'])->put('/client/portal/{slug}/projects/{projectSlug}', [ClientPortalApiController::class, 'updateProject']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects/{projectSlug}/tasks', [ClientPortalApiController::class, 'getTasks']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/projects/{projectSlug}/tasks', [ClientPortalApiController::class, 'createTask']);
Route::middleware(['web', 'auth'])->put('/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}', [ClientPortalApiController::class, 'updateTask']);
Route::middleware(['web', 'auth'])->delete('/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}', [ClientPortalApiController::class, 'deleteTask']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/time-entries', [ClientPortalApiController::class, 'getTimeEntries']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/time-entries', [ClientPortalApiController::class, 'createTimeEntry']);
Route::middleware(['web', 'auth'])->put('/client/portal/{slug}/time-entries/{entryId}', [ClientPortalApiController::class, 'updateTimeEntry']);
Route::middleware(['web', 'auth'])->delete('/client/portal/{slug}/time-entries/{entryId}', [ClientPortalApiController::class, 'deleteTimeEntry']);

// Client Portal Agreement/Invoice API routes
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/agreements', [ClientPortalAgreementApiController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/agreements/{agreementId}', [ClientPortalAgreementApiController::class, 'show']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/agreements/{agreementId}/sign', [ClientPortalAgreementApiController::class, 'sign']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/invoices', [ClientPortalAgreementApiController::class, 'getInvoices']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/invoices/{invoiceId}', [ClientPortalAgreementApiController::class, 'getInvoice']);

// Client Portal Proposal API routes
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/proposals', [ClientPortalProposalApiController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/proposals/{proposalId}', [ClientPortalProposalApiController::class, 'show']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/proposals/{proposalId}/accept', [ClientPortalProposalApiController::class, 'accept']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/proposals/{proposalId}/reject', [ClientPortalProposalApiController::class, 'reject']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/proposals/{proposalId}/request-changes', [ClientPortalProposalApiController::class, 'requestChanges']);

// User Management API routes (Admin only)
Route::middleware(['web', 'auth'])->get('/admin/feature-permissions', [UserManagementApiController::class, 'featurePermissions']);
Route::middleware(['web', 'auth'])->get('/admin/users', [UserManagementApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/admin/users', [UserManagementApiController::class, 'create']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/roles', [UserManagementApiController::class, 'addRole']);
Route::middleware(['web', 'auth'])->delete('/admin/users/{id}/roles/{role}', [UserManagementApiController::class, 'removeRole']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/password', [UserManagementApiController::class, 'setPassword']);
Route::middleware(['web', 'auth'])->put('/admin/users/{id}/feature-permissions', [UserManagementApiController::class, 'updateFeaturePermissions']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/email', [UserManagementApiController::class, 'updateEmail']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/login-as', [UserManagementApiController::class, 'loginAs']);

// Admin GenAI Jobs API
Route::middleware(['web', 'auth'])->get('/admin/genai-jobs', [AdminGenAiJobsController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/admin/genai-jobs/{id}', [AdminGenAiJobsController::class, 'show']);
Route::middleware(['web', 'auth'])->post('/admin/genai-jobs/{id}/requeue', [AdminGenAiJobsController::class, 'retry']);

// Admin Tax Normalization Review API
Route::middleware(['web', 'auth'])->get('/admin/tax-normalization-review', [AdminTaxNormalizationController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/admin/tax-normalization-review/acknowledge', [AdminTaxNormalizationController::class, 'acknowledge']);

// File Management API routes

// Project files
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects/{projectSlug}/files', [FileController::class, 'listProjectFiles']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/projects/{projectSlug}/files', [FileController::class, 'uploadProjectFile']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/projects/{projectSlug}/files/upload-url', [FileController::class, 'getProjectUploadUrl']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects/{projectSlug}/files/{fileId}/download', [FileController::class, 'downloadProjectFile']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects/{projectSlug}/files/{fileId}/history', [FileController::class, 'getProjectFileHistory']);
Route::middleware(['web', 'auth'])->delete('/client/portal/{slug}/projects/{projectSlug}/files/{fileId}', [FileController::class, 'deleteProjectFile']);

// Client company files
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/files', [FileController::class, 'listClientCompanyFiles']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/files', [FileController::class, 'uploadClientCompanyFile']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/files/upload-url', [FileController::class, 'getClientCompanyUploadUrl']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/files/{fileId}/download', [FileController::class, 'downloadClientCompanyFile']);
Route::middleware(['web', 'auth'])->delete('/client/portal/{slug}/files/{fileId}', [FileController::class, 'deleteClientCompanyFile']);

// Agreement files
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/agreements/{agreementId}/files', [FileController::class, 'listAgreementFiles']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/agreements/{agreementId}/files', [FileController::class, 'uploadAgreementFile']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/agreements/{agreementId}/files/{fileId}/download', [FileController::class, 'downloadAgreementFile']);
Route::middleware(['web', 'auth'])->delete('/client/portal/{slug}/agreements/{agreementId}/files/{fileId}', [FileController::class, 'deleteAgreementFile']);

// Task files
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}/files', [FileController::class, 'listTaskFiles']);
Route::middleware(['web', 'auth'])->post('/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}/files', [FileController::class, 'uploadTaskFile']);
Route::middleware(['web', 'auth'])->get('/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}/files/{fileId}/download', [FileController::class, 'downloadTaskFile']);
Route::middleware(['web', 'auth'])->delete('/client/portal/{slug}/projects/{projectSlug}/tasks/{taskId}/files/{fileId}', [FileController::class, 'deleteTaskFile']);

// Financial account files
Route::middleware(['web', 'auth'])->get('/finance/{accountId}/files', [FileController::class, 'listFinAccountFiles']);
Route::middleware(['web', 'auth'])->post('/finance/{accountId}/files', [FileController::class, 'uploadFinAccountFile']);
Route::middleware(['web', 'auth'])->post('/finance/{accountId}/files/attach', [FileController::class, 'attachFinAccountFile']);
Route::middleware(['web', 'auth'])->get('/finance/{accountId}/files/{fileId}/download', [FileController::class, 'downloadFinAccountFile']);
Route::middleware(['web', 'auth'])->delete('/finance/{accountId}/files/{fileId}', [FileController::class, 'deleteFinAccountFile']);
Route::middleware(['web', 'auth'])->get('/finance/{accountId}/statements/{statementId}/pdf', [FileController::class, 'viewStatementPdf']);

// Utility Bill Tracker API routes

Route::middleware(['web', 'auth', 'feature:utility-bills.view'])->get('/utility-bill-tracker/accounts', [UtilityAccountApiController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts', [UtilityAccountApiController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:utility-bills.view'])->get('/utility-bill-tracker/accounts/{id}', [UtilityAccountApiController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->put('/utility-bill-tracker/accounts/{id}/notes', [UtilityAccountApiController::class, 'updateNotes']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->delete('/utility-bill-tracker/accounts/{id}', [UtilityAccountApiController::class, 'destroy']);
Route::middleware(['web', 'auth', 'feature:utility-bills.view'])->get('/utility-bill-tracker/accounts/{accountId}/bills', [UtilityBillApiController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts/{accountId}/bills', [UtilityBillApiController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:utility-bills.view'])->get('/utility-bill-tracker/accounts/{accountId}/bills/{billId}', [UtilityBillApiController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->put('/utility-bill-tracker/accounts/{accountId}/bills/{billId}', [UtilityBillApiController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/toggle-status', [UtilityBillApiController::class, 'toggleStatus']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->delete('/utility-bill-tracker/accounts/{accountId}/bills/{billId}', [UtilityBillApiController::class, 'destroy']);
Route::middleware(['web', 'auth', 'feature:utility-bills.view'])->get('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/download-pdf', [UtilityBillApiController::class, 'downloadPdf']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->delete('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/pdf', [UtilityBillApiController::class, 'deletePdf']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/confirm', [UtilityBillImportController::class, 'confirm']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts/{accountId}/bills/genai-import/{jobId}/results/{resultId}/skip', [UtilityBillImportController::class, 'skip']);

// Utility Bill Linking routes
Route::middleware(['web', 'auth', 'feature:utility-bills.view'])->get('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/linkable', [UtilityBillLinkingController::class, 'findLinkableTransactions']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/link', [UtilityBillLinkingController::class, 'linkTransaction']);
Route::middleware(['web', 'auth', 'feature:utility-bills.manage'])->post('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/unlink', [UtilityBillLinkingController::class, 'unlinkTransaction']);

// Tax documents (W-2, W-2c, 1099-INT, 1099-INT-C, 1099-DIV, 1099-DIV-C, broker 1099, K-1, etc.)
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.export'])->post('/finance/tax-preview/export-xlsx', [TaxPreviewExportController::class, 'export']);
Route::middleware(['web', 'throttle:60,1'])->post('/financial-planning/career-comparison/export-xlsx', [CareerCompXlsxExportController::class, 'export']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/tax-preview-data', [TaxPreviewDataController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/tax-years/{year}/readiness-summary', [ReadinessSummaryController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view'])->get('/finance/tax-years/{year}/reconciliation-summary', [ReconciliationSummaryController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:finance.tax-preview.view,finance.tax-documents.view'])->get('/finance/tax-years/{year}/lot-reconciliation', [TaxDocumentLotReconciliationController::class, 'year']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-years/{year}/lots-match', [TaxYearLotsMatchController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents', [TaxDocumentController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/prompt', [TaxDocumentController::class, 'getPromptInfo']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/request-upload', [TaxDocumentController::class, 'requestUpload']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/manual', [TaxDocumentController::class, 'storeManual']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/multi-account', [TaxDocumentController::class, 'storeMultiAccount']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents', [TaxDocumentController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/all-reviewed', [TaxDocumentController::class, 'getAllReviewed']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/{id}/lot-reconciliation', [TaxDocumentLotReconciliationController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/{id}/lot-reconciliation-links', [TaxDocumentLotReconciliationController::class, 'links']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/{id}/lot-match-runs', [TaxDocumentLotMatchRunController::class, 'index']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/lots-rebuild', [TaxDocumentLotsRebuildController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/lots-match', [TaxDocumentLotsMatchController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/lots-match/full-rebuild', [TaxDocumentLotsMatchController::class, 'fullRebuild']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/lot-reconciliation-links/{id}/accept-broker', [LotReconciliationLinkController::class, 'acceptBroker']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/lot-reconciliation-links/{id}/accept-account-override', [LotReconciliationLinkController::class, 'acceptAccountOverride']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/lot-reconciliation-links/{id}/mark-duplicate', [LotReconciliationLinkController::class, 'markDuplicate']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/lot-reconciliation-links/{id}/unlink', [LotReconciliationLinkController::class, 'unlink']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/lot-reconciliation-links/relink', [LotReconciliationLinkController::class, 'relink']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/{id}', [TaxDocumentController::class, 'show']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.view'])->get('/finance/tax-documents/{id}/download', [TaxDocumentController::class, 'download']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->delete('/finance/tax-documents/{id}', [TaxDocumentController::class, 'destroy']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->put('/finance/tax-documents/{id}', [TaxDocumentController::class, 'update']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->put('/finance/tax-documents/{id}/mark-reviewed', [TaxDocumentController::class, 'markReviewed']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/convert-broker-format', [TaxDocumentController::class, 'convertBrokerFormat']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/repair-format', [TaxDocumentController::class, 'repairBrokerFormat']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/reprocess', [TaxDocumentController::class, 'reprocessBrokerDocument']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/accounts', [TaxDocumentController::class, 'confirmAccountLinks']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->post('/finance/tax-documents/{id}/accounts/bulk-update', [TaxDocumentAccountBulkUpdateController::class, 'store']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->patch('/finance/tax-documents/{id}/accounts/{linkId}', [TaxDocumentController::class, 'updateAccountLink']);
Route::middleware(['web', 'auth', 'feature:finance.tax-documents.manage'])->delete('/finance/tax-documents/{id}/accounts/{linkId}', [TaxDocumentController::class, 'destroyAccountLink']);

// GenAI Import routes
Route::middleware(['web', 'auth'])->post('/genai/import/request-upload', [GenAiImportController::class, 'requestUpload']);
Route::middleware(['web', 'auth'])->post('/genai/import/jobs', [GenAiImportController::class, 'createJob']);
Route::middleware(['web', 'auth'])->post('/genai/import/paste', [GenAiImportController::class, 'paste']);
Route::middleware(['web', 'auth'])->get('/genai/import/jobs', [GenAiImportController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/genai/import/jobs/{job_id}', [GenAiImportController::class, 'show']);
Route::middleware(['web', 'auth'])->post('/genai/import/jobs/{job_id}/retry', [GenAiImportController::class, 'retry']);
Route::middleware(['web', 'auth'])->delete('/genai/import/jobs/{job_id}', [GenAiImportController::class, 'destroy']);
