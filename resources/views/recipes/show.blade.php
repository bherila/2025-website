@extends('layouts.app')

@section('content')
    <div id="recipe-show-root"
         data-data="{{ json_encode($data) }}"
         data-content="{{ $content }}"
         data-related-recipes="{{ json_encode($relatedRecipes) }}"
         data-slug="{{ $slug }}">
    </div>
@endsection

@push('scripts')
    @viteReactRefresh
    @vite(['resources/js/recipes.tsx'])
@endpush