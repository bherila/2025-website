<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\FinanceApiController;
use App\Http\Controllers\PayslipController;

Route::middleware(['web', 'auth'])->get('/finance/accounts', [FinanceApiController::class, 'accounts']);
Route::middleware(['web', 'auth'])->post('/finance/accounts', [FinanceApiController::class, 'createAccount']);
Route::middleware(['web', 'auth'])->post('/finance/accounts/balance', [FinanceApiController::class, 'updateBalance']);
Route::middleware(['web', 'auth'])->get('/finance/chart', [FinanceApiController::class, 'chartData']);

Route::middleware(['web', 'auth'])->get('/finance/{account_id}/line_items', [FinanceApiController::class, 'getLineItems']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/line_items', [FinanceApiController::class, 'importLineItems']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}/line_items', [FinanceApiController::class, 'deleteLineItem']);
Route::middleware(['web', 'auth'])->get('/finance/tags', [FinanceApiController::class, 'getUserTags']);
Route::middleware(['web', 'auth'])->post('/finance/tags/apply', [FinanceApiController::class, 'applyTagToTransactions']);
Route::middleware(['web', 'auth'])->post('/finance/transactions/{transaction_id}/comment');
Route::middleware(['web', 'auth'])->get('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'getBalanceTimeseries']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'addBalanceSnapshot']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}/balance-timeseries', [FinanceApiController::class, 'deleteBalanceSnapshot']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/rename', [FinanceApiController::class, 'renameAccount']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/update-closed', [FinanceApiController::class, 'updateAccountClosed']);
Route::middleware(['web', 'auth'])->post('/finance/{account_id}/update-flags', [FinanceApiController::class, 'updateAccountFlags']);
Route::middleware(['web', 'auth'])->delete('/finance/{account_id}', [FinanceApiController::class, 'deleteAccount']);

Route::middleware(['web', 'auth'])->get('/payslips/years', [PayslipController::class, 'fetchPayslipYears']);
Route::middleware(['web', 'auth'])->get('/payslips', [PayslipController::class, 'fetchPayslips']);
Route::middleware(['web', 'auth'])->post('/payslips', [PayslipController::class, 'savePayslip']);
Route::middleware(['web', 'auth'])->delete('/payslips', [PayslipController::class, 'deletePayslip']);
Route::middleware(['web', 'auth'])->get('/payslips/details', [PayslipController::class, 'fetchPayslipByDetails']);
Route::middleware(['web', 'auth'])->post('/payslips/estimated-status', [PayslipController::class, 'updatePayslipEstimatedStatus']);

Route::middleware(['web', 'auth'])->get('/user', [App\Http\Controllers\UserApiController::class, 'getUser']);
Route::middleware(['web', 'auth'])->post('/user/update-email', [App\Http\Controllers\UserApiController::class, 'updateEmail']);
Route::middleware(['web', 'auth'])->post('/user/update-password', [App\Http\Controllers\UserApiController::class, 'updatePassword']);
Route::middleware(['web', 'auth'])->post('/user/update-api-key', [App\Http\Controllers\UserApiController::class, 'updateApiKey']);
