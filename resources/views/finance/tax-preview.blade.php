@extends('layouts.finance')

@section('title', 'Tax Preview | ' . config('app.name', 'Ben Herila'))

@section('content')
  @if(isset($preload))
    <script id="tax-preview-data" type="application/json">
      {!! json_encode($preload, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
  @endif
  <div class="w-full">
    <div id="FinanceNavbar" data-active-section="tax-preview"></div>
    <div id="TaxPreviewPage"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance.tsx')
@endpush
