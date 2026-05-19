@extends('layouts.game')

@section('title', 'Parking Pickup')

@section('content')
  <div id="cars-game-root"></div>
@endsection

@push('scripts')
  @vite('resources/js/games/cars/index.tsx')
@endpush
