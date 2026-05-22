@extends('layouts.app')

@section('content')
<div id="ClientManagementIndexPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management/admin/index.tsx')
@endpush
