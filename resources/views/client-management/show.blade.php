@extends('layouts.app')

@section('content')
<div id="ClientManagementShowPage" data-company-id="{{ $company->id }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management.tsx')
@endpush
