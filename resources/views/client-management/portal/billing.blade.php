@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
@portalJson([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'stripeBillingEnabled' => $stripeBillingEnabled ?? true,
  'stripePublishableKey' => $stripePublishableKey ?? null,
])
</script>
@endpush

<div id="ClientPortalBillingPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management/portal/billing.tsx')
@endpush
