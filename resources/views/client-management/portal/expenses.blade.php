@extends('layouts.app')

@section('content')
<div id="ClientPortalExpensesPage" 
     data-slug="{{ $slug }}" 
     data-company-name="{{ $company->company_name }}" 
     data-company-id="{{ $company->id }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
