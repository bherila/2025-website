@extends('layouts.app')

@section('title', 'PHR Summary')

@section('content')
  <div id="phr-summary-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/summary/index.tsx')
@endpush
