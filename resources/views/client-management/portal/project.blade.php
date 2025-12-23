@extends('layouts.app')

@section('content')
<div id="ClientPortalProjectPage" 
     data-slug="{{ $slug }}" 
     data-company-name="{{ $company->company_name }}"
     data-project-slug="{{ $project->slug }}"
     data-project-name="{{ $project->name }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
