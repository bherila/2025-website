@extends('layouts.phr')

@section('title', $tabLabel . ' | PHR | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="PhrNavbar" data-patient-id="{{ $patientId }}" data-active-tab="{{ $tab }}"></div>
  <div id="phr-page-content" class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" data-patient-id="{{ $patientId }}" data-tab="{{ $tab }}" data-can-manage="{{ $canManage ? 'true' : 'false' }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
