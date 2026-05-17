@extends('layouts.phr')

@section('title', 'Manage Patients | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="PhrNavbar" data-active-section="manage-patients"></div>
  <div id="phr-page-content" class="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8" data-section="manage-patients"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/pages.tsx')
@endpush
