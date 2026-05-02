<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    @viteReactRefresh
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Finance | ' . config('app.name', 'Ben Herila'))</title>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" integrity="sha512-c42qTSw/wPZ3/5LBzD+Bw5f7bSF2oxou6wEb+I/lqeaKV5FDIfMvvRp772y4jcJLKuGUOpbJMdg/BTl50fJYAw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    <script id="app-initial-data" type="application/json">
      {!! json_encode([
        'appName' => config('app.name', 'Ben Herila'),
        'appUrl' => config('app.url', ''),
        'authenticated' => auth()->check(),
        'isAdmin' => auth()->check() && auth()->user()->hasRole('admin'),
        'clientCompanies' => auth()->check() ? auth()->user()->clientCompanies()->select('client_companies.id', 'company_name', 'slug')->get() : [],
        'currentUser' => auth()->user() ? [
          'id' => auth()->id(),
          'name' => auth()->user()->name,
          'email' => auth()->user()->email,
          'user_role' => auth()->user()->user_role,
          'last_login_date' => optional(auth()->user()->last_login_date)->toDateTimeString(),
        ] : null,
      ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
    @stack('data-head')
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
    {{-- Finance layout: skip the main navbar, only load css + back-to-top --}}
    @vite(['resources/css/app.css', 'resources/js/back-to-top.tsx'])
    @stack('head')
    {{-- Noop script to trigger Vite JS parsing (mirrors app layout) --}}
    <script>(_=>{let a})()</script>
  </head>
  <body class="min-h-screen flex flex-col">
    <main class="flex-1">
      @yield('content')
    </main>

    @include('layouts.footer')

    <div id="back-to-top"></div>

    @stack('scripts')
  </body>
</html>
