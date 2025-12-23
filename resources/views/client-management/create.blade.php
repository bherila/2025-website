@extends('layouts.app')

@section('content')
<div id="ClientManagementCreatePage"></div>
@endsection

@push('scripts')
  @vite('resources/js/client-management.tsx')
@endpush
