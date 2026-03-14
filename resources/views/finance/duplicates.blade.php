@extends('layouts.finance')

@section('title', $accountName . ' Duplicates | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="{{ $account_id }}" data-active-tab="duplicates"></div>
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="duplicates"></div>
    <div id="DuplicatesPage" data-account-id="{{ $account_id }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
