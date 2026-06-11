@extends('layouts.finance')

@section('title', 'Finance | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="home"></div>
    <div id="FinanceHomePage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/home.tsx')
@endpush
