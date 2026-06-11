@extends('layouts.finance')

@section('title', 'Categorization | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="tags"></div>
    <div id="FinanceCategorizationPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/categorization.tsx')
@endpush
