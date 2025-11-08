@extends('layouts.app')

@section('content')
<div class="max-w-4xl mx-auto px-4 py-8">
    <h1 class="text-3xl font-bold mb-6">My Account</h1>
    <div id="my-account"></div>
</div>
@endsection

@push('scripts')
@vite(['resources/js/dashboard.tsx'])
@endpush