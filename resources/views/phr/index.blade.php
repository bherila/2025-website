@extends('layouts.app')

@section('title', 'PHR')

@section('content')
  <div id="phr-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/index.tsx')
@endpush
