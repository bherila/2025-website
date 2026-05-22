@extends('layouts.phr')

@section('title', 'PHR | ' . config('app.name', 'Ben Herila'))

@section('content')
  {{-- Miller-column shell: fill exactly one viewport so each column scrolls independently. --}}
  <div class="h-dvh flex flex-col overflow-hidden">
    <div id="PhrNavbar" class="shrink-0" data-patient-id="{{ $patientId }}"></div>
    <div id="phr-page-content" class="flex-1 min-h-0 overflow-hidden" data-patient-id="{{ $patientId }}" data-can-manage="{{ $canManage ? 'true' : 'false' }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
