@extends('layouts.app')

@section('content')

@push('data-head')
<script id="client-portal-initial-data" type="application/json">
{!! json_encode([
  'slug' => $slug,
  'companyName' => $company->company_name,
  'companyId' => $company->id,
'agreement' => $agreement,
  'invoices' => $invoices ?? [],
  'agreementFiles' => $agreementFiles ?? [],
], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
</script>
@endpush

<div id="ClientPortalAgreementPage"></div>
@endsection
@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
