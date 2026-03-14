@extends('layouts.finance')

@section('title', 'RSU | ' . config('app.name', 'Ben Herila'))

@section('content')
<div id="rsu-root"></div>
@viteReactRefresh
@vite('resources/js/components/rsu/rsu.tsx')
@endsection
