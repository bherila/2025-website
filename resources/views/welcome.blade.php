@extends('layouts.app')

@section('content')
  <section class="max-w-7xl mx-auto px-4 py-8 space-y-2">
    <h2 class="text-2xl font-semibold">Welcome</h2>
    <p class="">This is sample content demonstrating our global light/dark theme and a shadcn-style button demo below.</p>
  </section>
  <div id="app"></div>
@endsection

@push('scripts')
  @vite(['resources/js/app.jsx'])
@endpush
