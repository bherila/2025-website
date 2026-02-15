@extends('layouts.app')

@section('title', 'Manage RSU Awards | ' . config('app.name', 'Ben Herila'))

@section('content')
<div id="manage-awards-root"></div>
@viteReactRefresh
@vite('resources/js/components/rsu/manage-awards.tsx')
@endsection
