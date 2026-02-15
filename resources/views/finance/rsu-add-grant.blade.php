@extends('layouts.app')

@section('content')
<div id="add-grant-root"></div>
@viteReactRefresh
@vite('resources/js/components/rsu/add-grant.tsx')
@endsection
