@extends('layouts.app')

@section('content')
<div id="ClientPortalIndexPage" 
     data-slug="{{ $slug }}" 
     data-company-name="{{ $company->company_name }}" 
     data-company-id="{{ $company->id }}"
     data-is-admin="{{ auth()->user()?->hasRole('admin') ? 'true' : 'false' }}"
     data-projects="{{ json_encode($projects) }}"
     data-agreements="{{ json_encode($agreements) }}"
     data-company-users="{{ json_encode($companyUsers ?? []) }}"
     data-recent-time-entries="{{ json_encode($recentTimeEntries ?? []) }}"
     data-company-files="{{ json_encode($companyFiles ?? []) }}"
></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
