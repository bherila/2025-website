@extends('layouts.app')

@section('content')
<div id="payslip-entry-root"></div>
@endsection

@push('scripts')
@viteReactRefresh
@vite(['resources/js/payslip-entry.tsx'])
@endpush
