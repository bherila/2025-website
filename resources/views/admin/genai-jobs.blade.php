@extends('layouts.app')

@section('title', 'Admin: GenAI Jobs')

@section('content')
    <div id="AdminGenAiJobsPage"></div>
@endsection

@push('head')
    @vite(['resources/js/admin-genai-jobs.tsx'])
@endpush
