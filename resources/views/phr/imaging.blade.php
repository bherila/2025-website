@extends('layouts.app')

@section('title', 'PHR Imaging')

@section('content')
  <div id="phr-imaging-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/imaging/index.tsx')
@endpush
