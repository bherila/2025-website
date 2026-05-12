@extends('layouts.app')

@section('content')
  <div class="max-w-5xl mx-auto p-6">
    <div class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-6">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Address Label PDF Generator</h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">Paste addresses in TSV or CSV format (one label per row), choose a sheet format, and open a print-ready PDF.</p>

      <form id="address-label-form" class="mt-6 flex flex-col gap-4" method="POST" action="/tools/address-labels/pdf" target="_blank">
        @csrf

        <div class="flex flex-col gap-2">
          <label for="sheet_number" class="text-sm font-medium text-gray-800 dark:text-gray-200">Avery sheet number</label>
          <select id="sheet_number" name="sheet_number" class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 w-full md:w-96">
            <option value="48163">48163 — 2 x 4 inch mailing labels (2 columns × 5 rows)</option>
          </select>
        </div>

        <div class="flex flex-col gap-2">
          <label for="addresses" class="text-sm font-medium text-gray-800 dark:text-gray-200">Address rows (TSV/CSV)</label>
          <textarea id="addresses" name="addresses" rows="14" placeholder="Name\tStreet\tCity, ST ZIP\nJane Doe\t123 Main St\tAustin, TX 78701" class="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 font-mono text-sm"></textarea>
          <p class="text-xs text-gray-500 dark:text-gray-400">Tip: each row becomes one label, each column becomes a separate printed line on that label.</p>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" class="inline-flex items-center justify-center rounded-md bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700">Generate PDF</button>
          <span id="save-status" class="text-xs text-gray-500 dark:text-gray-400"></span>
        </div>
      </form>
    </div>
  </div>
@endsection

@push('scripts')
  <script @cspNonce>
    (function () {
      var key = 'tools.address_labels.input';
      var textarea = document.getElementById('addresses');
      var status = document.getElementById('save-status');

      if (!textarea) {
        return;
      }

      try {
        var cached = localStorage.getItem(key);
        if (cached) {
          textarea.value = cached;
        }
      } catch (error) {
        if (status) {
          status.textContent = 'Local save unavailable.';
        }
      }

      textarea.addEventListener('input', function () {
        try {
          localStorage.setItem(key, textarea.value);
          if (status) {
            status.textContent = 'Saved locally.';
          }
        } catch (error) {
          if (status) {
            status.textContent = 'Could not save locally.';
          }
        }
      });
    })();
  </script>
@endpush
