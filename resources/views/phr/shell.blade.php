@extends('layouts.phr')

@section('title', $title . ' | ' . config('app.name', 'Ben Herila'))

@section('content')
  @php
    $isPatientShell = isset($patientId);
    $shellClass = $isPatientShell ? 'h-dvh flex flex-col overflow-hidden' : 'min-h-dvh';
    $contentClass = $isPatientShell
        ? 'flex-1 min-h-0 overflow-hidden'
        : 'mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8';
  @endphp

  <div
    id="PhrShell"
    class="{{ $shellClass }}"
    @isset($patientId) data-patient-id="{{ $patientId }}" @endisset
    @isset($activeSection) data-active-section="{{ $activeSection }}" @endisset
    data-can-manage="{{ $canManage ? 'true' : 'false' }}"
  >
    <div
      id="PhrNavbar"
      @isset($patientId) data-patient-id="{{ $patientId }}" @endisset
      @isset($activeSection) data-active-section="{{ $activeSection }}" @endisset
    ></div>
    <div
      id="phr-page-content"
      class="{{ $contentClass }}"
      @isset($patientId) data-patient-id="{{ $patientId }}" @endisset
      @isset($activeSection) data-section="{{ $activeSection }}" @endisset
      data-can-manage="{{ $canManage ? 'true' : 'false' }}"
    >
      @if (($activeSection ?? null) === 'imports')
        <h1 class="text-2xl font-semibold text-foreground">Imports</h1>
        <p class="mt-2 text-sm text-muted-foreground">Coming soon.</p>
      @elseif (($activeSection ?? null) === 'config')
        <h1 class="text-2xl font-semibold text-foreground">PHR Config</h1>
        <p class="mt-2 text-sm text-muted-foreground">Coming soon.</p>
      @endif
    </div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
