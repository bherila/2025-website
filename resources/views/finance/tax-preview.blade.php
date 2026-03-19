@extends('layouts.finance')

@section('title', 'Tax Preview | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="tax-preview"></div>
    <div id="TaxPreviewPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
