@extends('layouts.finance')

@section('title', 'Tax Preview | ' . config('app.name', 'Ben Herila'))

@section('content')
  @if(isset($preload))
    <script id="tax-preview-data" type="application/json">
      {!! json_encode($preload, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
  @endif
  {{-- Dock mode is now the only supported Tax Preview UI. Keep a fixed viewport container
      so columns can scroll independently while preserving normal footer behavior below. --}}
  <div class="h-dvh flex flex-col overflow-hidden">
    <div id="FinanceNavbar" class="shrink-0" data-active-section="tax-preview"></div>
    <div id="TaxPreviewPage" class="flex-1 min-h-0 overflow-hidden"></div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/finance/pages/tax-preview.tsx')
@endpush
