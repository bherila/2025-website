@extends('layouts.app')

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/financial-planning/index.tsx')
@endpush
