@extends('layouts.finance')

@section('title', 'Schedule C View | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div class="w-full">
    <div id="ScheduleCPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
