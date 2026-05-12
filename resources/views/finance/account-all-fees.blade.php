@extends('layouts.finance')

@section('title', 'All Account Fees | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="all" data-active-tab="fees"></div>
    <div id="AllAccountsFeesTab"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
