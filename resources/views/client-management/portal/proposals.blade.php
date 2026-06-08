@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
{!! json_encode([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'proposals' => $proposals,
], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
</script>
@endpush

<div id="ClientPortalProposalsPage"></div>
@endsection
@push('scripts')
  @vite('resources/js/client-management/portal/proposals.tsx')
@endpush
