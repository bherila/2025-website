@extends('layouts.app')

@section('title', 'Financial Planning | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/financial-planning/index.tsx')
@endpush
