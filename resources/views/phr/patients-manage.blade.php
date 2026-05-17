@extends('layouts.app')

@section('title', 'PHR Patients Manage')

@section('content')
  <div id="phr-patients-manage-root" class="min-h-[calc(100vh-3.5rem)] bg-background"></div>
@endsection

@push('scripts')
  @vite('resources/js/phr/patients-manage/index.tsx')
@endpush
