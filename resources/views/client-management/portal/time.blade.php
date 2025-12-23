@extends('layouts.app')

@section('content')
@if(auth()->check() && (auth()->id() === 1 || auth()->user()->user_role === 'Admin'))
<div class="container mx-auto px-8 pt-4 max-w-6xl">
  <a href="/client/mgmt" class="text-sm text-muted-foreground hover:text-foreground">
    ← Manage Clients
  </a>
</div>
@endif
<div id="ClientPortalTimePage" data-slug="{{ $slug }}" data-company-name="{{ $company->company_name }}"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-portal.tsx')
@endpush
