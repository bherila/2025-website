@extends('layouts.app')

@section('content')
<x-client-admin-header />
<div id="ClientPortalAgreementPage" 
     data-slug="{{ $slug }}" 
     data-company-name="{{ $company->company_name }}"
     data-agreement-id="{{ $agreement->id }}"></div>
@endsection
@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
