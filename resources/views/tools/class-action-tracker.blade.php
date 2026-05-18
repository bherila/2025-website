@extends('layouts.app')

@section('title', 'Class Action Tracker')

@section('content')
<div class="mx-auto max-w-7xl px-4 py-8">
    <div id="class-action-tracker"></div>
</div>
@endsection

@push('scripts')
    @vite(['resources/js/class-action-tracker.tsx'])
@endpush
