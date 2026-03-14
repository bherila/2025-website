@extends('layouts.finance')

@section('title', $accountName . ' Lots | ' . config('app.name', 'Ben Herila'))

@section('content')
    <div class="w-full">
        <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="lots"
            data-account-name="{{ $accountName }}"></div>
        <div id="FinanceAccountLotsPage" data-account-id="{{ $account_id }}"></div>
    </div>
@endsection

@push('scripts')
    @vite('resources/js/finance.tsx')
@endpush
