@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
@portalJson([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'projects' => $projects,
  'agreements' => $agreements,
  'companyUsers' => $companyUsers ?? [],
  'recentTimeEntries' => $recentTimeEntries ?? [],
])
</script>
@endpush

<div id="ClientPortalIndexPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management/portal/index.tsx')
@endpush
