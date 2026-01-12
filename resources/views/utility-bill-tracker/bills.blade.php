@extends('layouts.app')

@section('content')
<div id="UtilityBillListPage" 
  data-account-id="{{ $account_id }}"
  data-account-name="{{ $account_name }}"
  data-account-type="{{ $account_type }}"
></div>
@endsection

@push('scripts')
  @vite('resources/js/utility-bill-tracker.tsx')
@endpush
