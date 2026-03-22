@extends('layouts.app')

@section('content')
<div id="ClientManagementIndexPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management.tsx')
@endpush
