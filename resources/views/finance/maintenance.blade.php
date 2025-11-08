@extends('layouts.app')

@section('content')
<div class="w-full">
<div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="maintenance" data-account-name="{{ $accountName }}"></div>
<div id="FinanceAccountMaintenancePage" data-account-id="{{ $account_id }}" data-account-name="{{ $accountName }}" data-when-closed="{{ $whenClosed }}" data-is-debt="{{ $isDebt }}" data-is-retirement="{{ $isRetirement }}"></div>
</div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
