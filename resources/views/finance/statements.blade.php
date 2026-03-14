@extends('layouts.finance')

@section('title', $accountName . ' Statements | ' . config('app.name', 'Ben Herila'))

@push('head')
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf_viewer.min.css" integrity="sha512-qbvpAGzPFbd9HG4VorZWXYAkAnbwKIxiLinTA1RW8KGJEZqYK04yjvd+Felx2HOeKPDKVLetAqg8RIJqHewaIg==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <script type="module">
    import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.min.mjs';
    window.pdfjsLib = pdfjsLib;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.4.149/pdf.worker.min.mjs';
  </script>
@endpush

@section('content')
  <div class="w-full">
    <div id="AccountNavigation" data-account-id="{{ $account_id }}" data-active-tab="statements"
      data-account-name="{{ $accountName }}"></div>
    <div id="FinanceAccountStatementsPage" data-account-id="{{ $account_id }}"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
