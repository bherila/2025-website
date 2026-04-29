@extends('layouts.app')

@section('title', 'Rent vs. Buy a Home')

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/financial-planning/rent-vs-buy.tsx')
@endpush
