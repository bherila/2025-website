@extends('layouts.app')

@section('title', 'PHR Vitals')

@section('content')
  <div id="phr-vitals-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/vitals/index.tsx')
@endpush
