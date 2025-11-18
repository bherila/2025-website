@extends('layouts.app')

@section('content')
<div class="w-full">
<div id="AccountNavigation" data-account-id="{{ $accountId }}" data-active-tab="statements" data-account-name="{{ $accountName }}"></div>
<div id="FinanceStatementDetailPage" data-snapshot-id="{{ $snapshot_id }}"></div>
</div>
@endsection

@push('scripts')
  @vite('resources/js/finance-statement-detail.tsx')
@endpush
