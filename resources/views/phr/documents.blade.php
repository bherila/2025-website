@extends('layouts.app')

@section('title', 'PHR Documents')

@section('content')
  <div id="phr-documents-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/documents/index.tsx')
@endpush
