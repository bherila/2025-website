@extends('layouts.game')

@section('title', 'Marble Sort')

@section('content')
  <div id="marble-sort-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/marble-sort/index.tsx')
@endpush
