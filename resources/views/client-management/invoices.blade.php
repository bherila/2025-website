@extends('layouts.app')

@section('content')
<div id="AllInvoicesPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management/admin/all-invoices.tsx')
@endpush
