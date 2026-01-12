@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto px-4 py-12">
    <div class="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-lg p-6">
        <h1 class="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100">Sign In</h1>

        <form method="POST" action="/login" class="space-y-4">
            @csrf

            <div>
                <label for="email" class="block text-sm font-semibold text-gray-900 dark:text-gray-200 mb-1">Email</label>
                <input
                    type="email"
                    id="email"
                    name="email"
                    value="{{ old('email') }}"
                    required
                    {{ $errors->any() ? '' : 'autofocus' }}
                    class="block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
            </div>

            <div>
                <label for="password" class="block text-sm font-semibold text-gray-900 dark:text-gray-200 mb-1">Password</label>
                <input
                    type="password"
                    id="password"
                    name="password"
                    required
                    {{ $errors->any() ? 'autofocus' : '' }}
                    class="block w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-md shadow-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                >
            </div>

            <button
                type="submit"
                class="w-full bg-blue-600 text-white py-2 px-4 rounded-md font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors cursor-pointer"
            >
                Sign In
            </button>

            @if($errors->has('email'))
                <p class="text-red-600 dark:text-red-400 text-sm mt-2">{{ $errors->first('email') }}</p>
            @endif
        </form>
    </div>
</div>
@endsection