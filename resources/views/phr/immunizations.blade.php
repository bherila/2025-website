@extends('layouts.app')

@section('title', 'PHR Immunizations')

@section('content')
  <div id="phr-immunizations-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/immunizations/index.tsx')
@endpush
