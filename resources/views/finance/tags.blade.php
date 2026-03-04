@extends('layouts.app')

@section('title', 'Manage Tags | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="ManageTagsPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush