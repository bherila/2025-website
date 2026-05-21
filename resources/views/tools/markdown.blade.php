@extends('layouts.app')

@section('title', 'Markdown Renderer | ' . config('app.name', 'Ben Herila'))

@push('data-head')
  <script id="markdown-renderer-initial-data" type="application/json" @cspNonce>
    {!! json_encode($initialData, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
  </script>
@endpush

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/markdown-renderer/index.tsx')
@endpush
