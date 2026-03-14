@extends('layouts.finance')

@section('title', 'All Accounts - Lot Analysis | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="all" data-active-tab="lots"></div>
    <div id="AllAccountsLotsPage" data-available-years="{{ json_encode($availableYears) }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
