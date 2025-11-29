@extends('layouts.app')

@section('content')
<div class="w-full">
<div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="duplicates" data-account-name="{{ $accountName }}"></div>
<div id="DuplicatesPage" data-account-id="{{ $account_id }}"></div>
</div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
