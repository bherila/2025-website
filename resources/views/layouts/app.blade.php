<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    @viteReactRefresh
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ config('app.name', 'Ben Herila') }}</title>
    <meta name="color-scheme" content="dark light">
    <script>
      (function() {
        try {
          var theme = localStorage.getItem('theme') || 'system';
          var d = document.documentElement;
          var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
          if (isDark) d.classList.add('dark'); else d.classList.remove('dark');
        } catch (e) { /* no-op */ }
      })();
    </script>
    @vite(['resources/css/app.css', 'resources/js/navbar.tsx'])
    @stack('head')
    <script>(_=>{let a})()</script>
  </head>
  <body class="min-h-screen">
    <header class="site-header border-b border-gray-200 dark:border-[#3E3E3A] h-14">
      <div id="navbar" data-authenticated="{{ auth()->check() ? 'true' : 'false' }}" />
    </header>

    <main class="min-h-[70vh]">
      @yield('content')
    </main>

    <footer class="border-t border-gray-200 dark:border-[#3E3E3A] py-6 text-sm text-center text-gray-600 dark:text-[#A1A09A]">
      © {{ date('Y') }} Ben Herila
    </footer>

    @stack('scripts')
  </body>
</html>
