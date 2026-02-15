@extends('layouts.app')

@section('title', 'Add RSU Grant | ' . config('app.name', 'Ben Herila'))

@section('content')
<div id="add-grant-root"></div>
@viteReactRefresh
@vite('resources/js/components/rsu/add-grant.tsx')
@endsection
