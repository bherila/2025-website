@extends('layouts.app')

@section('content')
<div id="manage-awards-root"></div>
@viteReactRefresh
@vite('resources/js/components/rsu/manage-awards.tsx')
@endsection
