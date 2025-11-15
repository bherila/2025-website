@extends('layouts.app')

@section('content')
  <div id="app"></div>
@endsection

@push('scripts')
  @vite('resources/js/irsf461/irsf461.tsx')
@endpush