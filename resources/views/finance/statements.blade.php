@extends('layouts.finance')

@section('title', $accountName . ' Statements | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="{{ $account_id }}" data-active-tab="statements"></div>
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="statements"></div>
    <div id="FinanceAccountStatementsPage" data-account-id="{{ $account_id }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/statements.tsx')
@endpush
