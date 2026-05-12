<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Address Labels {{ $sheetNumber }}</title>
  <style>
    @page {
      size: letter portrait;
      margin: 0.5in 0.25in;
    }

    body {
      margin: 0;
      font-family: DejaVu Sans, sans-serif;
      font-size: 11pt;
      color: #111;
    }

    .sheet {
      width: 8in;
      margin: 0 auto;
      display: grid;
      grid-template-columns: 4in 4in;
      grid-template-rows: repeat(5, 2in);
      page-break-after: always;
    }

    .sheet:last-child {
      page-break-after: auto;
    }

    .label {
      box-sizing: border-box;
      width: 4in;
      height: 2in;
      padding: 0.2in;
      line-height: 1.3;
      white-space: pre-line;
      overflow: hidden;
    }
  </style>
</head>
<body>
@foreach ($pages as $page)
  <div class="sheet">
    @for ($i = 0; $i < 10; $i++)
      @php
        $labelLines = $page[$i] ?? [];
      @endphp
      <div class="label">{{ implode("\n", $labelLines) }}</div>
    @endfor
  </div>
@endforeach
</body>
</html>
