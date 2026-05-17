@extends('layouts.app')

@section('title', 'PHR Labs')

@section('content')
  <div id="phr-labs-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/labs/index.tsx')
@endpush
