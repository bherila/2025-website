@extends('layouts.phr')

@section('title', $tabLabel . ' | PHR | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="PhrNavbar" data-patient-id="{{ $patientId }}" data-active-tab="{{ $tab }}"></div>
  <div class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
    <h1 class="text-2xl font-semibold text-foreground">{{ $tabLabel }}</h1>
    <p class="mt-2 text-sm text-muted-foreground">Coming soon.</p>
    @if (!$canManage)
      <p class="mt-1 text-sm text-muted-foreground">Read-only access.</p>
    @endif
  </div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
