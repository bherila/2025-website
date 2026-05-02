@extends('layouts.app')

@section('title', 'Retirement Contribution Calculator | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/financial-planning/retirement-contribution-calculator.tsx')
@endpush
