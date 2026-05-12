@extends('layouts.app')

@section('content')
  <div class="max-w-6xl mx-auto p-6">
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Address Label PDF Generator</h1>

      @if ($errors->any())
        <div class="mt-4 rounded border border-red-300 bg-red-50 text-red-800 text-sm p-3">{{ $errors->first() }}</div>
      @endif

      <form id="address-label-form" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4" method="POST" action="{{ route('tools.address-labels.pdf') }}" target="_blank">
        @csrf
        <div>
          <label for="sheet_number" class="text-sm">Avery sheet number</label>
          <select id="sheet_number" name="sheet_number" class="w-full rounded border px-3 py-2 mt-1 bg-white dark:bg-gray-950 dark:border-gray-700">
            @foreach ($sheetOptions as $key => $option)
              <option value="{{ $key }}" data-label-count="{{ $option['rows'] * $option['columns'] }}" @selected(old('sheet_number', '48163') === $key)>{{ $key }} - {{ $option['label_height'] }} x {{ $option['label_width'] }} in ({{ $option['rows'] * $option['columns'] }}/page)</option>
            @endforeach
          </select>
        </div>
        <div>
          <label for="parser_mode" class="text-sm">Parser mode</label>
          <select id="parser_mode" name="parser_mode" class="w-full rounded border px-3 py-2 mt-1 bg-white dark:bg-gray-950 dark:border-gray-700">
            <option value="auto" @selected(old('parser_mode', 'auto') === 'auto')>Auto detect</option>
            <option value="delimited" @selected(old('parser_mode') === 'delimited')>Delimited rows (CSV/TSV)</option>
            <option value="blocks" @selected(old('parser_mode') === 'blocks')>Blank-line separated blocks</option>
          </select>
        </div>
        <div><label for="font_size" class="text-sm">Font size (pt)</label><input id="font_size" name="font_size" type="number" min="7" max="14" value="{{ old('font_size', 11) }}" class="w-full rounded border px-3 py-2 mt-1 bg-white dark:bg-gray-950 dark:border-gray-700" /></div>
        <div><label for="skip_count" class="text-sm">Skip labels on first sheet</label><input id="skip_count" name="skip_count" type="number" min="0" value="{{ old('skip_count', 0) }}" class="w-full rounded border px-3 py-2 mt-1 bg-white dark:bg-gray-950 dark:border-gray-700" /></div>
        <div><label for="copies" class="text-sm">Copies of first label</label><input id="copies" name="copies" type="number" min="1" value="{{ old('copies', 1) }}" class="w-full rounded border px-3 py-2 mt-1 bg-white dark:bg-gray-950 dark:border-gray-700" /></div>
        <div>
          <label for="vertical_align" class="text-sm">Vertical align</label>
          <select id="vertical_align" name="vertical_align" class="w-full rounded border px-3 py-2 mt-1 bg-white dark:bg-gray-950 dark:border-gray-700">
            <option value="top" @selected(old('vertical_align', 'top') === 'top')>Top</option>
            <option value="center" @selected(old('vertical_align') === 'center')>Center</option>
          </select>
        </div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="bold_first_line" value="1" @checked(old('bold_first_line')) /> Bold first line</label>

        <div class="md:col-span-2">
          <label for="addresses" class="text-sm">Address rows</label>
          <textarea id="addresses" name="addresses" rows="14" class="w-full rounded border px-3 py-2 mt-1 font-mono text-sm bg-white dark:bg-gray-950 dark:border-gray-700">{{ old('addresses') }}</textarea>
          <div id="stats" class="text-xs text-gray-500 dark:text-gray-400 mt-1">0 labels -> 0 pages</div>
        </div>

        <div class="md:col-span-2 flex gap-2 flex-wrap">
          <button type="submit" class="rounded bg-blue-600 text-white px-4 py-2">Open PDF</button>
          <button type="submit" name="download" value="1" class="rounded bg-gray-700 text-white px-4 py-2">Download PDF</button>
          <button type="submit" formaction="{{ route('tools.address-labels.preview') }}" formtarget="_blank" class="rounded bg-emerald-600 text-white px-4 py-2">Preview</button>
          <a id="calibration-link" href="{{ route('tools.address-labels.calibration', ['sheet_number' => old('sheet_number', '48163')]) }}" target="_blank" class="rounded bg-amber-600 text-white px-4 py-2">Print calibration sheet</a>
        </div>
      </form>
    </div>
  </div>
@endsection

@push('scripts')
<script @cspNonce>
(function(){
  const key='tools.address_labels.input.v2';
  const textarea=document.getElementById('addresses');
  const sheet=document.getElementById('sheet_number');
  const parserMode=document.getElementById('parser_mode');
  const skipCount=document.getElementById('skip_count');
  const copies=document.getElementById('copies');
  const stats=document.getElementById('stats');
  const calibrationLink=document.getElementById('calibration-link');
  if(!textarea||!sheet||!parserMode||!skipCount||!copies||!stats||!calibrationLink){return;}
  function readStorage(){try{return localStorage.getItem(key);}catch(_){return null;}}
  function writeStorage(value){try{localStorage.setItem(key,value);}catch(_){}}
  if(textarea.value.trim()===''){
    textarea.value=readStorage()||'';
  }
  textarea.addEventListener('input',()=>{writeStorage(textarea.value); updateStats();});
  [sheet,parserMode,skipCount,copies].forEach((element)=>element.addEventListener('change',updateStats));
  function updateStats(){
    const rowCount=estimateRows();
    const selected=sheet.options[sheet.selectedIndex];
    const perPage=Math.max(1,parseInt(selected?.dataset.labelCount||'10',10));
    const copyCount=Math.max(1,parseInt(copies.value||'1',10)||1);
    const skipped=Math.max(0,parseInt(skipCount.value||'0',10)||0);
    const labelCount=rowCount===0?0:rowCount+copyCount-1;
    const pages=labelCount===0?0:Math.ceil((labelCount+skipped)/perPage);
    stats.textContent=`${labelCount} ${labelCount===1?'label':'labels'} -> ${pages} ${pages===1?'page':'pages'}`;
    const url=new URL(calibrationLink.href,window.location.href);
    url.searchParams.set('sheet_number',sheet.value);
    calibrationLink.href=url.toString();
  }
  function estimateRows(){
    const value=textarea.value.trim();
    if(value===''){return 0;}
    if(parserMode.value==='blocks'||(parserMode.value==='auto'&&/\n\s*\n/.test(value))){
      return value.split(/\n\s*\n/).filter((block)=>block.trim()!=='').length;
    }

    return value.split(/\n/).filter((line)=>line.trim()!=='').length;
  }
  updateStats();
})();
</script>
@endpush
