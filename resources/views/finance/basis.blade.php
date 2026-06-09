@extends('layouts.finance')

@section('title', $accountName . ' Basis | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-account-id="{{ $account_id }}" data-active-tab="basis"></div>
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="basis"></div>
    <div id="PartnershipBasisTab" data-account-id="{{ $account_id }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/account-basis.tsx')
@endpush
