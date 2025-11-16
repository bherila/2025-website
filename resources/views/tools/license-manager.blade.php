@extends('layouts.app')

@section('content')
<div class="max-w-7xl mx-auto px-4 py-8">
    {{-- <h1 class="text-3xl font-bold mb-4">License Manager</h1> --}}
    <div id="license-manager"></div>
</div>
@endsection

@push('scripts')
    @vite(['resources/js/license-manager.tsx'])
@endpush