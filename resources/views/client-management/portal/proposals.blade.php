@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
@portalJson([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'proposals' => $proposals,
])
</script>
@endpush

<div id="ClientPortalProposalsPage"></div>
@endsection
@push('scripts')
  @vite('resources/js/client-management/portal/proposals.tsx')
@endpush
