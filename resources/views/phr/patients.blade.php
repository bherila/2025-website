@extends('layouts.app')

@section('title', 'PHR Patients')

@section('content')
  <div id="phr-patients-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/patients/index.tsx')
@endpush
