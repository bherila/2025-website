@extends('layouts.app')

@section('content')
<div class="w-full">
<div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="summary" data-account-name="{{ $accountName }}"></div>
<div id="AccountSummaryClient" data-totals="{{ json_encode($totals) }}" data-symbol-summary="{{ json_encode($symbolSummary) }}" data-month-summary="{{ json_encode($monthSummary) }}"></div>
</div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
