@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
@portalJson([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'project' => $project,
  'tasks' => $tasks ?? [],
  'companyUsers' => $companyUsers ?? [],
  'projects' => $projects ?? [],
])
</script>
@endpush

<div id="ClientPortalProjectPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management/portal/project.tsx')
@endpush
