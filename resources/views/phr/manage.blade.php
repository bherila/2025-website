@extends('layouts.phr')

@section('title', 'Manage Patients | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="PhrNavbar" data-active-section="manage-patients"></div>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="text-2xl font-semibold text-foreground">Manage Patients</h1>
    <p class="mt-2 text-sm text-muted-foreground">Coming soon.</p>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
