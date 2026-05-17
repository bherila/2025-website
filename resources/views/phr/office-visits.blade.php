@extends('layouts.app')

@section('title', 'PHR Office Visits')

@section('content')
  <div id="phr-office-visits-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/office-visits/index.tsx')
@endpush
