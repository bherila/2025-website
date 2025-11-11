@extends('layouts.app')

@section('content')
<div id="payslip-root"></div>
@endsection

@push('scripts')
@viteReactRefresh
@vite(['resources/js/payslip.tsx'])
@endpush
