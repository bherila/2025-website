@extends('layouts.app')

@section('content')
<div class="max-w-md mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold mb-6">Sign In</h1>

    <form method="POST" action="/login" class="space-y-4">
        @csrf

        <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input
                type="email"
                id="email"
                name="email"
                value="{{ old('email') }}"
                required
                {{ $errors->any() ? '' : 'autofocus' }}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
        </div>

        <div>
            <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Password</label>
            <input
                type="password"
                id="password"
                name="password"
                required
                {{ $errors->any() ? 'autofocus' : '' }}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
            >
        </div>

        <button
            type="submit"
            class="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
            Sign In
        </button>

        @if($errors->has('email'))
            <p class="text-red-600 text-sm">{{ $errors->first('email') }}</p>
        @endif
    </form>
</div>
@endsection