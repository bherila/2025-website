@extends('layouts.app')

@section('title', 'PHR Procedures')

@section('content')
  <div id="phr-procedures-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/procedures/index.tsx')
@endpush
