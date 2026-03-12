@extends('layouts.app')

@section('title', 'All Transactions | ' . config('app.name', 'Ben Herila'))

@section('content')
  <div id="AllTransactionsPage"></div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
