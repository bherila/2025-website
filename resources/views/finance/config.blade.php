@extends('layouts.finance')

@section('title', 'Config | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="FinanceNavbar" data-active-section="config"></div>
  <div class="w-full">
    <div id="FinanceConfigPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
