@extends('layouts.app')

@section('title', 'PHR Conditions')

@section('content')
  <div id="phr-conditions-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/conditions/index.tsx')
@endpush
