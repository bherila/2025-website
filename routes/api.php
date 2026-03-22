<?php

use App\Http\Controllers\ClientManagement\ClientAgreementApiController;
use App\Http\Controllers\ClientManagement\ClientCompanyApiController;
use App\Http\Controllers\ClientManagement\ClientCompanyUserController;
use App\Http\Controllers\ClientManagement\ClientExpenseApiController;
use App\Http\Controllers\ClientManagement\ClientInvoiceApiController;
use App\Http\Controllers\ClientManagement\ClientPortalAgreementApiController;
use App\Http\Controllers\ClientManagement\ClientPortalApiController;
use App\Http\Controllers\FileController;
use App\Http\Controllers\FinanceTool\FinanceApiController;
use App\Http\Controllers\FinanceTool\FinanceEmploymentEntityController;
use App\Http\Controllers\FinanceTool\FinanceGeminiImportController;
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
use App\Http\Controllers\FinanceTool\StatementController;
use App\Http\Controllers\LicenseKeyController;
use App\Http\Controllers\LoginAuditController;
use App\Http\Controllers\PasskeyController;
use App\Http\Controllers\UserApiController;
use App\Http\Controllers\UserManagementApiController;
use App\Http\Controllers\UtilityBillTracker\UtilityAccountApiController;
use App\Http\Controllers\UtilityBillTracker\UtilityBillApiController;
use App\Http\Controllers\UtilityBillTracker\UtilityBillImportController;
use App\Http\Controllers\UtilityBillTracker\UtilityBillLinkingController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth'])->get('/finance/accounts', [FinanceApiController::class, 'accounts']);
Route::middleware(['web', 'auth'])->post('/finance/accounts', [FinanceApiController::class, 'createAccount']);
Route::middleware(['web', 'auth'])->post('/finance/accounts/balance', [FinanceApiController::class, 'updateBalance']);
Route::middleware(['web', 'auth'])->get('/finance/chart', [FinanceApiController::class, 'chartData']);
Route::middleware(['web', 'auth'])->get('/rsu', [FinanceRsuController::class, 'getRsuData']);
Route::middleware(['web', 'auth'])->post('/rsu', [FinanceRsuController::class, 'upsertRsuGrants']);
Route::middleware(['web', 'auth'])->delete('/rsu/{id}', [FinanceRsuController::class, 'deleteRsuGrant']);

// Transaction routes (FinanceTransactionsApiController)
// /finance/all/... routes must come before /finance/{account_id}/... to avoid conflicts
Route::middleware(['web', 'auth'])->get('/finance/all-line-items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth'])->get('/finance/all/line_items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth'])->get('/finance/all/transaction-years', [FinanceTransactionsApiController::class, 'getTransactionYears']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'importLineItems']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/transaction', [FinanceTransactionsApiController::class, 'createTransaction']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'deleteLineItem']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/transaction-years', [FinanceTransactionsApiController::class, 'getTransactionYears']);
Route::middleware(['web', 'auth'])->get('/finance/tags', [FinanceTransactionTaggingApiController::class, 'getUserTags']);
Route::middleware(['web', 'auth'])->post('/finance/tags/apply', [FinanceTransactionTaggingApiController::class, 'applyTagToTransactions']);
Route::middleware(['web', 'auth'])->post('/finance/tags/remove', [FinanceTransactionTaggingApiController::class, 'removeTagsFromTransactions']);
Route::middleware(['web', 'auth'])->post('/finance/tags', [FinanceTransactionTaggingApiController::class, 'createTag']);
Route::middleware(['web', 'auth'])->put('/finance/tags/{tag_id}', [FinanceTransactionTaggingApiController::class, 'updateTag']);
Route::middleware(['web', 'auth'])->delete('/finance/tags/{tag_id}', [FinanceTransactionTaggingApiController::class, 'deleteTag']);

// Finance Rules Engine
Route::middleware(['web', 'auth'])->get('/finance/rules', [FinanceRulesApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/finance/rules', [FinanceRulesApiController::class, 'store']);
Route::middleware(['web', 'auth'])->put('/finance/rules/{id}', [FinanceRulesApiController::class, 'update']);
Route::middleware(['web', 'auth'])->delete('/finance/rules/{id}', [FinanceRulesApiController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/finance/rules/reorder', [FinanceRulesApiController::class, 'reorder']);
Route::middleware(['web', 'auth'])->post('/finance/rules/{id}/run', [FinanceRulesApiController::class, 'runNow']);
Route::middleware(['web', 'auth'])->post('/finance/rules/preview-matches', [FinanceRulesApiController::class, 'previewMatches']);

Route::middleware(['web', 'auth'])->get('/finance/schedule-c', [FinanceScheduleCController::class, 'getSummary']);

// Employment Entity routes
Route::middleware(['web', 'auth'])->get('/finance/employment-entities', [FinanceEmploymentEntityController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/finance/employment-entities', [FinanceEmploymentEntityController::class, 'store']);
Route::middleware(['web', 'auth'])->put('/finance/employment-entities/{id}', [FinanceEmploymentEntityController::class, 'update']);
Route::middleware(['web', 'auth'])->delete('/finance/employment-entities/{id}', [FinanceEmploymentEntityController::class, 'destroy']);

// Marriage status routes
Route::middleware(['web', 'auth'])->get('/finance/marriage-status', [FinanceEmploymentEntityController::class, 'getMarriageStatus']);
Route::middleware(['web', 'auth'])->post('/finance/marriage-status', [FinanceEmploymentEntityController::class, 'updateMarriageStatus']);

Route::middleware(['web', 'auth'])->post('/finance/transactions/{transaction_id}/update', [FinanceTransactionsApiController::class, 'updateTransaction']);
Route::middleware(['web', 'auth'])->get('/finance/transactions/{transaction_id}/links', [FinanceTransactionLinkingApiController::class, 'getTransactionLinks']);
Route::middleware(['web', 'auth'])->get('/finance/transactions/{transaction_id}/linkable', [FinanceTransactionLinkingApiController::class, 'findLinkableTransactions']);
Route::middleware(['web', 'auth'])->post('/finance/transactions/link', [FinanceTransactionLinkingApiController::class, 'linkTransactions']);
Route::middleware(['web', 'auth'])->post('/finance/transactions/{transaction_id}/unlink', [FinanceTransactionLinkingApiController::class, 'unlinkTransaction']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/linkable-pairs', [FinanceTransactionLinkingApiController::class, 'findLinkablePairs']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'getBalanceTimeseries']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/summary', [FinanceApiController::class, 'getSummary']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/balance-timeseries', [StatementController::class, 'addFinAccountStatement']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'deleteBalanceSnapshot']);
Route::middleware(['web', 'auth'])->put('/finance/balance-timeseries/{statement_id}', [StatementController::class, 'updateFinAccountStatement']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/rename', [FinanceApiController::class, 'renameAccount']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/update-closed', [FinanceApiController::class, 'updateAccountClosed']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/update-flags', [FinanceApiController::class, 'updateAccountFlags']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}', [FinanceApiController::class, 'deleteAccount']);

Route::middleware(['web', 'auth'])->get('/payslips/years', [FinancePayslipController::class, 'fetchPayslipYears']);
Route::middleware(['web', 'auth'])->get('/payslips', [FinancePayslipController::class, 'fetchPayslips']);
Route::middleware(['web', 'auth'])->post('/payslips', [FinancePayslipController::class, 'savePayslip']);
Route::middleware(['web', 'auth'])->post('/payslips/import', [FinancePayslipImportController::class, 'import']);
Route::middleware(['web', 'auth'])->delete('/payslips/{payslip_id}', [FinancePayslipController::class, 'deletePayslip']);
Route::middleware(['web', 'auth'])->get('/payslips/{payslip_id}', [FinancePayslipController::class, 'fetchPayslipById']);
Route::middleware(['web', 'auth'])->post('/payslips/{payslip_id}/estimated-status', [FinancePayslipController::class, 'updatePayslipEstimatedStatus']);

Route::middleware(['web', 'auth'])->get('/user', [UserApiController::class, 'getUser']);

Route::middleware(['web', 'auth'])->get('/license-keys', [LicenseKeyController::class, 'index']);
Route::middleware(['web', 'auth'])->put('/license-keys/{id}', [LicenseKeyController::class, 'update']);
Route::middleware(['web', 'auth'])->delete('/license-keys/{id}', [LicenseKeyController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/license-keys', [LicenseKeyController::class, 'store']);
Route::middleware(['web', 'auth'])->post('/license-keys/import', [LicenseKeyController::class, 'import']);
Route::middleware(['web', 'auth'])->post('/user/update-email', [UserApiController::class, 'updateEmail']);
Route::middleware(['web', 'auth'])->post('/user/update-password', [UserApiController::class, 'updatePassword']);
Route::middleware(['web', 'auth'])->post('/finance/transactions/import-gemini', [FinanceGeminiImportController::class, 'parseDocument']);
Route::middleware(['web', 'auth'])->post('/finance/multi-import-pdf', [StatementController::class, 'importMultiAccountPdf']);
Route::middleware(['web', 'auth'])->get('/finance/statement/{statement_id}/details', [StatementController::class, 'getDetails']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/all-statement-details', [StatementController::class, 'getFinStatementDetails']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/import-ib-statement', [StatementController::class, 'importIbStatement']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/import-pdf-statement', [StatementController::class, 'importPdfStatement']);
Route::middleware(['web', 'auth'])->post('/finance/statement/{statement_id}/import-gemini', [FinanceGeminiImportController::class, 'importStatementDetails']);

// Lots API routes
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/lots', [FinanceLotsController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/lots', [FinanceLotsController::class, 'store']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/lots/import', [FinanceLotsController::class, 'importLots']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/lots/save-analyzed', [FinanceLotsController::class, 'saveAnalyzedLots']);
Route::middleware(['web', 'auth'])->put('/finance/{account_id}/lots/{lot_id}', [FinanceLotsController::class, 'updateLot']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}/lots/{lot_id}', [FinanceLotsController::class, 'deleteLot']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/lots/search-transactions', [FinanceLotsController::class, 'searchTransactions']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/lots/by-transaction/{t_id}', [FinanceLotsController::class, 'lotsByTransaction']);
Route::middleware(['web', 'auth'])->post('/finance/lots/search-opening', [FinanceLotsController::class, 'searchOpeningTransactions']);
Route::middleware(['web', 'auth'])->post('/finance/lots/save-assignment', [FinanceLotsController::class, 'saveLotAssignment']);

Route::middleware(['web', 'auth'])->post('/user/update-api-key', [UserApiController::class, 'updateApiKey']);

// Passkey (WebAuthn) routes
Route::middleware(['web', 'auth'])->get('/passkeys', [PasskeyController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/passkeys/register/options', [PasskeyController::class, 'registrationOptions']);
Route::middleware(['web', 'auth'])->post('/passkeys/register', [PasskeyController::class, 'register']);
Route::middleware(['web', 'auth'])->delete('/passkeys/{id}', [PasskeyController::class, 'destroy']);

// Passkey login (unauthenticated)
Route::middleware(['web'])->post('/passkeys/auth/options', [PasskeyController::class, 'authOptions']);
Route::middleware(['web'])->post('/passkeys/auth', [PasskeyController::class, 'authenticate']);

// Login audit log routes
Route::middleware(['web', 'auth'])->get('/login-audit', [LoginAuditController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/login-audit/{id}/suspicious', [LoginAuditController::class, 'markSuspicious']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/duplicates', [FinanceTransactionsDedupeApiController::class, 'findDuplicates']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/merge-duplicates', [FinanceTransactionsDedupeApiController::class, 'mergeDuplicates']);

// Client Management API routes
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies', [ClientCompanyApiController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{id}', [ClientCompanyApiController::class, 'show']);
Route::middleware(['web', 'auth'])->put('/client/mgmt/companies/{id}', [ClientCompanyApiController::class, 'update']);
Route::middleware(['web', 'auth'])->get('/client/mgmt/users', [ClientCompanyApiController::class, 'getUsers']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/assign-user', [ClientCompanyUserController::class, 'store']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/create-user-and-assign', [ClientCompanyApiController::class, 'createUserAndAssign']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/{companyId}/users/{userId}', [ClientCompanyUserController::class, 'destroy']);

// Client Agreement API routes (Admin)
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{companyId}/agreements', [ClientAgreementApiController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/client/mgmt/agreements/{id}', [ClientAgreementApiController::class, 'show']);
Route::middleware(['web', 'auth'])->put('/client/mgmt/agreements/{id}', [ClientAgreementApiController::class, 'update']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/agreements/{id}/terminate', [ClientAgreementApiController::class, 'terminate']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/agreements/{id}', [ClientAgreementApiController::class, 'destroy']);

// Client Invoice API routes (Admin)
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{company}/invoices', [ClientInvoiceApiController::class, 'index']);
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{company}/invoices/{invoice}', [ClientInvoiceApiController::class, 'show']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/generate-all', [ClientInvoiceApiController::class, 'generateAll']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices', [ClientInvoiceApiController::class, 'store']);
Route::middleware(['web', 'auth'])->put('/client/mgmt/companies/{company}/invoices/{invoice}', [ClientInvoiceApiController::class, 'update']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/{invoice}/issue', [ClientInvoiceApiController::class, 'issue']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/{invoice}/mark-paid', [ClientInvoiceApiController::class, 'markPaid']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/{invoice}/void', [ClientInvoiceApiController::class, 'void']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/{invoice}/unvoid', [ClientInvoiceApiController::class, 'unVoid']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/companies/{company}/invoices/{invoice}', [ClientInvoiceApiController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/{invoice}/line-items', [ClientInvoiceApiController::class, 'addLineItem']);
Route::middleware(['web', 'auth'])->put('/client/mgmt/companies/{company}/invoices/{invoice}/line-items/{lineId}', [ClientInvoiceApiController::class, 'updateLineItem']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/companies/{company}/invoices/{invoice}/line-items/{lineId}', [ClientInvoiceApiController::class, 'removeLineItem']);

// Client Invoice Payment API routes (Admin)
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{company}/invoices/{invoice}/payments', [ClientInvoiceApiController::class, 'getPayments']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/invoices/{invoice}/payments', [ClientInvoiceApiController::class, 'addPayment']);
Route::middleware(['web', 'auth'])->put('/client/mgmt/companies/{company}/invoices/{invoice}/payments/{payment}', [ClientInvoiceApiController::class, 'updatePayment']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/companies/{company}/invoices/{invoice}/payments/{payment}', [ClientInvoiceApiController::class, 'deletePayment']);

// Client Expense API routes (Admin)
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{company}/expenses', [ClientExpenseApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/expenses', [ClientExpenseApiController::class, 'store']);
Route::middleware(['web', 'auth'])->get('/client/mgmt/companies/{company}/expenses/{expense}', [ClientExpenseApiController::class, 'show']);
Route::middleware(['web', 'auth'])->put('/client/mgmt/companies/{company}/expenses/{expense}', [ClientExpenseApiController::class, 'update']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/companies/{company}/expenses/{expense}', [ClientExpenseApiController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/expenses/{expense}/mark-reimbursed', [ClientExpenseApiController::class, 'markReimbursed']);
Route::middleware(['web', 'auth'])->post('/client/mgmt/companies/{company}/expenses/{expense}/link-finance', [ClientExpenseApiController::class, 'linkToFinanceLineItem']);
Route::middleware(['web', 'auth'])->delete('/client/mgmt/companies/{company}/expenses/{expense}/link-finance', [ClientExpenseApiController::class, 'unlinkFromFinanceLineItem']);

// Client Portal API routes
Route::middleware(['web', 'auth'])->get('/client/portal/companies', [ClientPortalApiController::class, 'getAccessibleCompanies']);
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

// User Management API routes (Admin only)
Route::middleware(['web', 'auth'])->get('/admin/users', [UserManagementApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/admin/users', [UserManagementApiController::class, 'create']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/roles', [UserManagementApiController::class, 'addRole']);
Route::middleware(['web', 'auth'])->delete('/admin/users/{id}/roles/{role}', [UserManagementApiController::class, 'removeRole']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/password', [UserManagementApiController::class, 'setPassword']);
Route::middleware(['web', 'auth'])->post('/admin/users/{id}/email', [UserManagementApiController::class, 'updateEmail']);

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

Route::middleware(['web', 'auth'])->get('/utility-bill-tracker/accounts', [UtilityAccountApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/utility-bill-tracker/accounts', [UtilityAccountApiController::class, 'store']);
Route::middleware(['web', 'auth'])->get('/utility-bill-tracker/accounts/{id}', [UtilityAccountApiController::class, 'show']);
Route::middleware(['web', 'auth'])->put('/utility-bill-tracker/accounts/{id}/notes', [UtilityAccountApiController::class, 'updateNotes']);
Route::middleware(['web', 'auth'])->delete('/utility-bill-tracker/accounts/{id}', [UtilityAccountApiController::class, 'destroy']);
Route::middleware(['web', 'auth'])->get('/utility-bill-tracker/accounts/{accountId}/bills', [UtilityBillApiController::class, 'index']);
Route::middleware(['web', 'auth'])->post('/utility-bill-tracker/accounts/{accountId}/bills', [UtilityBillApiController::class, 'store']);
Route::middleware(['web', 'auth'])->get('/utility-bill-tracker/accounts/{accountId}/bills/{billId}', [UtilityBillApiController::class, 'show']);
Route::middleware(['web', 'auth'])->put('/utility-bill-tracker/accounts/{accountId}/bills/{billId}', [UtilityBillApiController::class, 'update']);
Route::middleware(['web', 'auth'])->post('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/toggle-status', [UtilityBillApiController::class, 'toggleStatus']);
Route::middleware(['web', 'auth'])->delete('/utility-bill-tracker/accounts/{accountId}/bills/{billId}', [UtilityBillApiController::class, 'destroy']);
Route::middleware(['web', 'auth'])->get('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/download-pdf', [UtilityBillApiController::class, 'downloadPdf']);
Route::middleware(['web', 'auth'])->delete('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/pdf', [UtilityBillApiController::class, 'deletePdf']);
Route::middleware(['web', 'auth'])->post('/utility-bill-tracker/accounts/{accountId}/bills/import-pdf', [UtilityBillImportController::class, 'import']);

// Utility Bill Linking routes
Route::middleware(['web', 'auth'])->get('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/linkable', [UtilityBillLinkingController::class, 'findLinkableTransactions']);
Route::middleware(['web', 'auth'])->post('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/link', [UtilityBillLinkingController::class, 'linkTransaction']);
Route::middleware(['web', 'auth'])->post('/utility-bill-tracker/accounts/{accountId}/bills/{billId}/unlink', [UtilityBillLinkingController::class, 'unlinkTransaction']);
