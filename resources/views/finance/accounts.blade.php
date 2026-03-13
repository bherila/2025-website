@extends('layouts.app')

@section('title', 'Finance Accounts | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="FinanceSubNav" data-active-section="accounts"></div>
  <div id="FinanceAccountsPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush