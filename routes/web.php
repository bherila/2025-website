<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

Route::get('/tools/maxmin', function () {
    return view('tools.maxmin');
});

Route::get('/finance/rsu', function () {
    return view('finance.rsu');
});

Route::get('/finance/payslips', function () {
    return view('finance.payslips');
});

Route::get('/finance/accounts', function () {
    return view('finance.accounts');
});

Route::get('/tools/license-manager', function () {
    return view('tools.license-manager');
});

Route::get('/tools/bingo', function () {
    return view('tools.bingo');
});

Route::get('/tools/irs-f461', function () {
    return view('tools.irs-f461');
});
