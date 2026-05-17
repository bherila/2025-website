@extends('layouts.app')

@section('title', 'PHR Access')

@section('content')
  <div id="phr-access-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/access/index.tsx')
@endpush
