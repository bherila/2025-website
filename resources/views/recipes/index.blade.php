@extends('layouts.app')

@section('content')
    <div
        id="recipes-root"
        data-recipes="{{ json_encode($recipes) }}"
        data-categories="{{ json_encode($categories) }}"
    ></div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/recipes.tsx'])
@endpush