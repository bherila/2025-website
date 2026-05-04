@extends('layouts.app')

@section('title', 'Admin: Tax Normalization Review')

@section('content')
    <div id="AdminTaxNormalizationPage"></div>
@endsection

@push('head')
    @vite(['resources/js/admin-tax-normalization.tsx'])
@endpush
