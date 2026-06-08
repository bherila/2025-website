@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
@portalJson([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'agreement' => $agreement,
  'invoices' => $invoices ?? [],
])
</script>
@endpush

<div id="ClientPortalAgreementPage"></div>
@endsection
@push('scripts')
  @vite('resources/js/client-management/portal/agreement.tsx')
@endpush
