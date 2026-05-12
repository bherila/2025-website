@extends('layouts.app')

@section('content')
  <div class="max-w-6xl mx-auto p-6">
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Address Label PDF Generator</h1>

      @if ($errors->any())
        <div class="mt-4 rounded border border-red-300 bg-red-50 text-red-800 text-sm p-3">{{ $errors->first() }}</div>
      @endif

      <form id="address-label-form" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4" method="POST" action="/tools/address-labels/pdf" target="_blank">
        @csrf
        <div>
          <label class="text-sm">Avery sheet number</label>
          <select id="sheet_number" name="sheet_number" class="w-full rounded border px-3 py-2 mt-1">
            @foreach ($sheetOptions as $key => $option)
              <option value="{{ $key }}">{{ $key }} — {{ $option['label_height'] }} x {{ $option['label_width'] }} in ({{ $option['rows'] * $option['columns'] }}/page)</option>
            @endforeach
          </select>
        </div>
        <div>
          <label class="text-sm">Parser mode</label>
          <select name="parser_mode" class="w-full rounded border px-3 py-2 mt-1">
            <option value="auto">Auto detect</option>
            <option value="delimited">Delimited rows (CSV/TSV)</option>
            <option value="blocks">Blank-line separated blocks</option>
          </select>
        </div>
        <div><label class="text-sm">Font size (pt)</label><input name="font_size" type="number" min="7" max="14" value="11" class="w-full rounded border px-3 py-2 mt-1" /></div>
        <div><label class="text-sm">Skip labels on first sheet</label><input name="skip_count" type="number" min="0" value="0" class="w-full rounded border px-3 py-2 mt-1" /></div>
        <div><label class="text-sm">Copies of first label</label><input name="copies" type="number" min="1" value="1" class="w-full rounded border px-3 py-2 mt-1" /></div>
        <div><label class="text-sm">Vertical align</label><select name="vertical_align" class="w-full rounded border px-3 py-2 mt-1"><option value="top">Top</option><option value="center">Center</option></select></div>
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" name="bold_first_line" value="1" /> Bold first line</label>

        <div class="md:col-span-2">
          <label for="addresses" class="text-sm">Address rows</label>
          <textarea id="addresses" name="addresses" rows="14" class="w-full rounded border px-3 py-2 mt-1 font-mono text-sm"></textarea>
          <div id="stats" class="text-xs text-gray-500 mt-1">0 rows → 0 pages</div>
        </div>

        <div class="md:col-span-2 flex gap-2 flex-wrap">
          <button type="submit" class="rounded bg-blue-600 text-white px-4 py-2">Open PDF</button>
          <button type="submit" name="download" value="1" class="rounded bg-gray-700 text-white px-4 py-2">Download PDF</button>
          <button type="submit" formaction="/tools/address-labels/preview" formtarget="_blank" class="rounded bg-emerald-600 text-white px-4 py-2">Preview</button>
          <a href="/tools/address-labels/calibration?sheet_number=48163" target="_blank" class="rounded bg-amber-600 text-white px-4 py-2">Print calibration sheet</a>
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
  const stats=document.getElementById('stats');
  if(!textarea){return;}
  textarea.value=localStorage.getItem(key)||'';
  textarea.addEventListener('input',()=>{localStorage.setItem(key,textarea.value); updateStats();});
  sheet?.addEventListener('change', updateStats);
  function updateStats(){
    const rows=textarea.value.split(/\n\s*\n|\n/).filter(v=>v.trim()!=='').length;
    const selected=sheet.options[sheet.selectedIndex].text;
    const m=selected.match(/\((\d+)\/page\)/); const perPage=m?parseInt(m[1],10):10;
    stats.textContent=`${rows} rows → ${Math.max(1, Math.ceil(rows/Math.max(1,perPage)))} pages`;
  }
  updateStats();
})();
</script>
@endpush
