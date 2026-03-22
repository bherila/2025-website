@extends('layouts.app')

@section('title', 'Utility Bill Tracker | ' . config('app.name', 'Ben Herila'))

@section('content')
<div id="UtilityAccountListPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/utility-bill-tracker.tsx')
@endpush
