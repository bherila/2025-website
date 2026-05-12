@extends('layouts.app')

@section('content')
@php
  $perPage = $spec->labelsPerPage();
  $chunks = array_chunk($rows, $perPage);
  $lineHeight = $fontSize / 72 * 1.35;
@endphp
<div class="mx-auto max-w-7xl p-6">
  @foreach($chunks as $chunk)
    <div class="relative mb-8 overflow-hidden border border-gray-300 bg-white text-gray-900 shadow-sm" style="width: 8.5in; height: 11in;">
      @for($row = 0; $row < $spec->rows(); $row++)
        @for($column = 0; $column < $spec->columns(); $column++)
          @php
            $index = ($row * $spec->columns()) + $column;
            $lines = $chunk[$index] ?? [];
            $x = $spec->leftMarginInches() + ($column * $spec->horizontalPitchInches());
            $y = $spec->topMarginInches() + ($row * $spec->verticalPitchInches());
            $blockHeight = count($lines) * $lineHeight;
            $contentHeight = $spec->labelHeightInches() - 0.16;
            $topPadding = $center ? 0.08 + max(0, ($contentHeight - $blockHeight) / 2) : 0.08;
          @endphp
          <div class="absolute border border-dashed border-gray-300 p-[0.08in]" style="left: {{ $x }}in; top: {{ $y }}in; width: {{ $spec->labelWidthInches() }}in; height: {{ $spec->labelHeightInches() }}in; font-size: {{ $fontSize }}pt; padding-top: {{ $topPadding }}in;">
            @foreach($lines as $idx => $line)
              <div class="{{ $boldFirstLine && $idx === 0 ? 'font-bold' : '' }} overflow-hidden text-ellipsis whitespace-nowrap" style="line-height: {{ $lineHeight }}in;">{{ $line }}</div>
            @endforeach
          </div>
        @endfor
      @endfor
    </div>
  @endforeach
</div>
@endsection
