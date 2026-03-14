@extends('layouts.finance')

@section('title', $accountName . ' Linker | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="{{ $account_id }}" data-active-tab="linker"></div>
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="linker"></div>
    <div id="LinkerPage" data-account-id="{{ $account_id }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
