@extends('layouts.app')

@section('content')
<div class="w-full">
<div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="import" data-account-name="{{ $accountName }}"></div>
<div id="ImportTransactionsClient" data-account-id="{{ $account_id }}" data-account-name="{{ $accountName }}"></div>
</div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
