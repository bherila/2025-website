@extends('layouts.finance')

@section('title', $accountName . ' Fees | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="{{ $account_id }}" data-active-tab="fees"></div>
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="fees"></div>
    <div id="FeesTab" data-account-id="{{ $account_id }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
