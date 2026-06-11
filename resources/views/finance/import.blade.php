@extends('layouts.finance')

@section('title', 'Import Center | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="import"></div>
    <div id="FinanceImportCenterPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/import.tsx')
@endpush
