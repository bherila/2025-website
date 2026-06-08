@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
@portalJson([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
  'invoice' => $invoice ?? null,
  'stripeBillingEnabled' => $stripeBillingEnabled ?? true,
  'stripePublishableKey' => $stripePublishableKey ?? null,
  'stripeMaxAmountCents' => $stripeMaxAmountCents ?? 100000,
])
</script>
@endpush

<div id="ClientPortalInvoicePage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management/portal/invoice.tsx')
@endpush
