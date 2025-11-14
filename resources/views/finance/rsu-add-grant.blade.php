@extends('layouts.app')

@section('content')
<div id="add-grant-root"></div>
@viteReactRefresh
@vite('resources/js/add-grant.tsx')
@endsection
