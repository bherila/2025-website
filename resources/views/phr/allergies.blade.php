@extends('layouts.app')

@section('title', 'PHR Allergies')

@section('content')
  <div id="phr-allergies-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/allergies/index.tsx')
@endpush
