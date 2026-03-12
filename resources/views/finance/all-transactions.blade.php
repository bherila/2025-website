@extends('layouts.app')

@section('title', 'All Transactions | ' . config('app.name', 'Ben Herila'))

@php
  $uid = Auth::id();
  $accountIds = \App\Models\FinanceTool\FinAccounts::where('acct_owner', $uid)->pluck('acct_id');
  $years = \App\Models\FinanceTool\FinAccountLineItems::whereIn('t_account', $accountIds)
      ->selectRaw('DISTINCT YEAR(t_date) as year')
      ->whereNotNull('t_date')
      ->orderBy('year', 'desc')
      ->pluck('year')
      ->toArray();
@endphp

@section('content')
  <div id="AllTransactionsPage" data-available-years="{{ json_encode($years) }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
