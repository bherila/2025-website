@extends('layouts.app')

@section('content')
  <script id="address-labels-data" type="application/json" @cspNonce>
    {!! json_encode([
      'csrfToken' => csrf_token(),
      'errors' => $errors->all(),
      'old' => [
        'addresses' => old('addresses', ''),
        'bold_first_line' => (bool) old('bold_first_line', false),
        'copies' => old('copies', 1),
        'font_size' => old('font_size', 11),
        'parser_mode' => old('parser_mode', 'auto'),
        'sheet_number' => old('sheet_number', '48163'),
        'skip_count' => old('skip_count', 0),
        'vertical_align' => old('vertical_align', 'top'),
      ],
      'routes' => [
        'calibration' => route('tools.address-labels.calibration'),
        'pdf' => route('tools.address-labels.pdf'),
        'preview' => route('tools.address-labels.preview'),
      ],
      'sheetOptions' => $sheetOptions,
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
  </script>
  <div id="address-labels-root">
    <div class="max-w-6xl mx-auto p-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Address Label PDF Generator</h1>
    </div>
  </div>
@endsection

@push('scripts')
  @vite('resources/js/address-labels/index.tsx')
@endpush
