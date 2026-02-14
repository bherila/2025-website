@extends('layouts.app')

@section('content')

@push('data-head')
<script>
  window.__CLIENT_PORTAL_INITIAL_DATA__ = {!! json_encode([
    'slug' => $slug,
    'companyName' => $company->company_name,
    'companyId' => $company->id,
    'isAdmin' => auth()->user()?->hasRole('admin') ? true : false,
    'projects' => $projects,
    'agreements' => $agreements,
    'companyUsers' => $companyUsers ?? [],
    'recentTimeEntries' => $recentTimeEntries ?? [],
    'companyFiles' => $companyFiles ?? [],
  ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!};
</script>
@endpush

<div id="ClientPortalIndexPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
