@extends('layouts.app')

@section('title', 'PHR Medications')

@section('content')
  <div id="phr-medications-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/medications/index.tsx')
@endpush
