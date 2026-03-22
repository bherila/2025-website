@extends('layouts.finance')

@section('title', 'Import Transactions - All Accounts | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="all" data-active-tab="import"></div>
    <div id="AccountNavigation" data-account-id="all" data-active-tab="import"></div>
    <div id="ImportTransactionsClient" data-account-id="all" data-account-name="All Accounts"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
