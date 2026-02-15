@extends('layouts.app')

@section('content')
<div id="rsu-root"></div>
@viteReactRefresh
@vite('resources/js/components/rsu/rsu.tsx')
@endsection