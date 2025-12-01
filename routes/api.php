<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FinanceApiController;
use App\Http\Controllers\FinanceTransactionsApiController;
use App\Http\Controllers\FinanceTransactionsDedupeApiController;
use App\Http\Controllers\FinanceTransactionLinkingApiController;
use App\Http\Controllers\FinanceTransactionTaggingApiController;
use App\Http\Controllers\PayslipController;
use App\Http\Controllers\PayslipImportController;
use App\Http\Controllers\RsuController;
use App\Http\Controllers\StatementController;

Route::middleware(['web', 'auth'])->get('/finance/accounts', [FinanceApiController::class, 'accounts']);
Route::middleware(['web', 'auth'])->post('/finance/accounts', [FinanceApiController::class, 'createAccount']);
Route::middleware(['web', 'auth'])->post('/finance/accounts/balance', [FinanceApiController::class, 'updateBalance']);
Route::middleware(['web', 'auth'])->get('/finance/chart', [FinanceApiController::class, 'chartData']);
Route::middleware(['web', 'auth'])->get('/rsu', [RsuController::class, 'getRsuData']);
Route::middleware(['web', 'auth'])->post('/rsu', [RsuController::class, 'addRsuGrants']);

// Transaction routes (FinanceTransactionsApiController)
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'importLineItems']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}/line_items', [FinanceTransactionsApiController::class, 'deleteLineItem']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/transaction-years', [FinanceTransactionsApiController::class, 'getTransactionYears']);
Route::middleware(['web', 'auth'])->get('/finance/tags', [FinanceTransactionTaggingApiController::class, 'getUserTags']);
Route::middleware(['web', 'auth'])->post('/finance/tags', [FinanceTransactionTaggingApiController::class, 'createTag']);
Route::middleware(['web', 'auth'])->put('/finance/tags/{tag_id}', [FinanceTransactionTaggingApiController::class, 'updateTag']);
Route::middleware(['web', 'auth'])->delete('/finance/tags/{tag_id}', [FinanceTransactionTaggingApiController::class, 'deleteTag']);
Route::middleware(['web', 'auth'])->post('/finance/tags/apply', [FinanceTransactionTaggingApiController::class, 'applyTagToTransactions']);
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

Route::middleware(['web', 'auth'])->get('/payslips/years', [PayslipController::class, 'fetchPayslipYears']);
Route::middleware(['web', 'auth'])->get('/payslips', [PayslipController::class, 'fetchPayslips']);
Route::middleware(['web', 'auth'])->post('/payslips', [PayslipController::class, 'savePayslip']);
Route::middleware(['web', 'auth'])->post('/payslips/import', [PayslipImportController::class, 'import']);
Route::middleware(['web', 'auth'])->delete('/payslips/{payslip_id}', [PayslipController::class, 'deletePayslip']);
Route::middleware(['web', 'auth'])->get('/payslips/{payslip_id}', [PayslipController::class, 'fetchPayslipById']);
Route::middleware(['web', 'auth'])->post('/payslips/{payslip_id}/estimated-status', [PayslipController::class, 'updatePayslipEstimatedStatus']);

Route::middleware(['web', 'auth'])->get('/user', [App\Http\Controllers\UserApiController::class, 'getUser']);

Route::middleware(['web', 'auth'])->get('/license-keys', [App\Http\Controllers\LicenseKeyController::class, 'index']);
Route::middleware(['web', 'auth'])->put('/license-keys/{id}', [App\Http\Controllers\LicenseKeyController::class, 'update']);
Route::middleware(['web', 'auth'])->delete('/license-keys/{id}', [App\Http\Controllers\LicenseKeyController::class, 'destroy']);
Route::middleware(['web', 'auth'])->post('/license-keys', [App\Http\Controllers\LicenseKeyController::class, 'store']);
Route::middleware(['web', 'auth'])->post('/license-keys/import', [App\Http\Controllers\LicenseKeyController::class, 'import']);
Route::middleware(['web', 'auth'])->post('/user/update-email', [App\Http\Controllers\UserApiController::class, 'updateEmail']);
Route::middleware(['web', 'auth'])->post('/user/update-password', [App\Http\Controllers\UserApiController::class, 'updatePassword']);
Route::middleware(['web', 'auth'])->post('/finance/transactions/import-gemini', [App\Http\Controllers\TransactionGeminiImportController::class, 'import']);
Route::middleware(['web', 'auth'])->get('/finance/statement/{statement_id}/details', [StatementController::class, 'getDetails']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/all-statement-details', [StatementController::class, 'getFinStatementDetails']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/import-ib-statement', [StatementController::class, 'importIbStatement']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/import-pdf-statement', [StatementController::class, 'importPdfStatement']);
Route::middleware(['web', 'auth'])->post('/user/update-api-key', [App\Http\Controllers\UserApiController::class, 'updateApiKey']);
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/duplicates', [FinanceTransactionsDedupeApiController::class, 'findDuplicates']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/merge-duplicates', [FinanceTransactionsDedupeApiController::class, 'mergeDuplicates']);
