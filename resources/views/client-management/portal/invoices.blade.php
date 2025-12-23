@extends('layouts.app')

@section('content')

<x-client-admin-header />

<div id="ClientPortalInvoicesPage" data-slug="{{ $slug }}" data-company-name="{{ $company->company_name }}"></div>

@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
