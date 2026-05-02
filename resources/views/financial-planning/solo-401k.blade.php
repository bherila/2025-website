@extends('layouts.app')

@section('title', 'Solo 401(k) Calculator | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/financial-planning/solo-401k.tsx')
@endpush
