@extends('layouts.finance')

@section('title', 'Documents | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="documents"></div>
    <div id="FinanceDocumentsPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/documents.tsx')
@endpush
