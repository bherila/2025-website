@extends('layouts.phr')

@section('title', 'PHR Patients | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="PhrNavbar" data-active-section="patients"></div>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="text-2xl font-semibold text-foreground">Patients</h1>
    <p class="mt-2 text-sm text-muted-foreground">Choose a patient from the picker to open their records.</p>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
