@extends('layouts.app')

@section('title', 'Finance Payslips | ' . config('app.name', 'Ben Herila'))

@section('content')
    <div id="FinanceSubNav" data-active-section="payslips"></div>
    <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-4">Finance Payslips</h1>
        <p>The tool is temporarily unavailable.</p>
    </div>
    @viteReactRefresh
    @vite('resources/js/finance.tsx')
@endsection