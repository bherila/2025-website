@extends('layouts.app')

@section('content')
<div id="ClientAgreementShowPage" 
     data-agreement-id="{{ $agreement->id }}"
     data-company-id="{{ $company->id }}"
     data-company-name="{{ $company->company_name }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management.tsx')
@endpush
