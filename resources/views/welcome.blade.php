@extends('layouts.app')

@section('title', "Hi, I'm Ben Herila")

@section('content')
  <div id="home"></div>
@endsection

@push('scripts')
  @vite(['resources/js/home.tsx'])
@endpush
