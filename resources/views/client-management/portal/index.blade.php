@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
{!! json_encode([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'projects' => $projects,
  'agreements' => $agreements,
  'companyUsers' => $companyUsers ?? [],
  'recentTimeEntries' => $recentTimeEntries ?? [],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
</script>
@endpush

<div id="ClientPortalIndexPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
