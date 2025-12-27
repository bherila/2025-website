@extends('layouts.app')

@section('content')
<x-client-admin-header :company="$company" />
<div id="ClientPortalProjectPage" 
     data-slug="{{ $slug }}" 
     data-company-name="{{ $company->company_name }}"
     data-project-slug="{{ $project->slug }}"
     data-project-name="{{ $project->name }}"
     data-is-admin="{{ auth()->user()?->hasRole('admin') ? 'true' : 'false' }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
