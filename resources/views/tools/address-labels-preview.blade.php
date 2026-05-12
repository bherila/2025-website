@extends('layouts.app')
@section('content')
@php
  $perPage = $spec->labelsPerPage();
  $chunks = array_chunk($rows, $perPage);
@endphp
<div class="max-w-7xl mx-auto p-6">
  @foreach($chunks as $chunk)
    <div class="grid gap-1 mb-6" style="grid-template-columns: repeat({{ $spec->columns() }}, minmax(0, 1fr));">
      @for($i=0; $i<$perPage; $i++)
        <div class="border border-gray-300 p-2 bg-white text-gray-900 {{ $center ? 'flex items-center' : '' }}" style="min-height: 6rem; font-size: {{ $fontSize }}pt;">
          @foreach(($chunk[$i] ?? []) as $idx => $line)
            <div class="{{ $boldFirstLine && $idx === 0 ? 'font-bold' : '' }} break-words">{{ $line }}</div>
          @endforeach
        </div>
      @endfor
    </div>
  @endforeach
</div>
@endsection
