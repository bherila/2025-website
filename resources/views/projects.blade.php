@extends('layouts.app')

@section('content')
    <div id="projects-root"></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/projects.tsx'])
@endpush