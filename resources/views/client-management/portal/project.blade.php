@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
{!! json_encode([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'project' => $project,
  'tasks' => $tasks ?? [],
  'companyUsers' => $companyUsers ?? [],
  'projects' => $projects ?? [],
  'projectFiles' => $projectFiles ?? [],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
</script>
@endpush

<div id="ClientPortalProjectPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
