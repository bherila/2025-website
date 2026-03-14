@extends('layouts.finance')

@section('title', 'All Transactions | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="all" data-active-tab="transactions"></div>
    <div id="TransactionsPage" data-account-id="all" data-available-years="{{ json_encode($availableYears) }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
