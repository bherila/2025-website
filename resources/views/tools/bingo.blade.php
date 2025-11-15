@extends('layouts.app')

@section('content')
    <div id="bingo-root"></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite('resources/js/bingo/index.tsx')
@endpush