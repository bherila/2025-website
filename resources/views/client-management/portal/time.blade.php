@extends('layouts.app')

@section('content')

@push('data-head')
<script>
  // Hydrate initial data for the Client Portal Time page (only the pieces we need client-side)
  window.__CLIENT_PORTAL_INITIAL_DATA__ = {!! json_encode([
    'slug' => $slug,
    'companyName' => $company->company_name,
    'companyId' => $company->id,
    'isAdmin' => auth()->user()?->hasRole('admin') ? true : false,
    'companyUsers' => $companyUsers ?? [],
    'projects' => $projects ?? [],
  ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!};
</script>
@endpush

<div id="ClientPortalTimePage" data-slug="{{ $slug }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
