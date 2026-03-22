@extends('layouts.finance')

@section('title', 'Import Transactions - ' . $accountName . ' | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="{{ $account_id }}" data-active-tab="import"></div>
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="import"></div>
    <div id="ImportTransactionsClient" data-account-id="{{ $account_id }}" data-account-name="{{ $accountName }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
