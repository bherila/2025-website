@extends('layouts.app')

@section('content')
<div id="ClientPortalIndexPage" data-slug="{{ $slug }}" data-company-name="{{ $company->company_name }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
