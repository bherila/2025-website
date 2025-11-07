@extends('layouts.app')

@section('content')
<div id="FinanceAccountsPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
