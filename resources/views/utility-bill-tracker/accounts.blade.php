@extends('layouts.app')

@section('content')
<div id="UtilityAccountListPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/utility-bill-tracker.tsx')
@endpush
