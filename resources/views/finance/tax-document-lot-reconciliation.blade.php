@extends('layouts.finance')

@section('title', $title . ' | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="tax-preview"></div>
    <div
      id="LotReconciliationPage"
      data-tax-document-id="{{ $taxDocumentId }}"
      data-tax-year="{{ $taxYear }}"
    ></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
