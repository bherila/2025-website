@extends('layouts.app')

@section('content')
<div id="ClientPortalInvoicePage" 
     data-slug="{{ $slug }}" 
     data-company-name="{{ $company->company_name }}"
     data-company-id="{{ $company->id }}"
     data-invoice-id="{{ $invoiceId }}"
     data-is-admin="{{ auth()->user()?->hasRole('admin') ? 'true' : 'false' }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
