@extends('layouts.app')

@section('content')
<div id="manage-awards-root"></div>
@viteReactRefresh
@vite('resources/js/manage-awards.tsx')
@endsection
