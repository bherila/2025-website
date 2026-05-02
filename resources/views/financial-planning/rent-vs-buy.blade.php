@extends('layouts.app')

@section('title', 'Rent vs. Buy a Home | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/financial-planning/rent-vs-buy.tsx')
@endpush
