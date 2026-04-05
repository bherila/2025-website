<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    @viteReactRefresh
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', config('app.name', 'Ben Herila'))</title>
    <meta name="color-scheme" content="dark light">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css" integrity="sha512-c42qTSw/wPZ3/5LBzD+Bw5f7bSF2oxou6wEb+I/lqeaKV5FDIfMvvRp772y4jcJLKuGUOpbJMdg/BTl50fJYAw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
    @php
      $__isAdmin = auth()->check() && auth()->user()->hasRole('admin');
      $__isAuthenticated = auth()->check();
      $__clientCompanies = $__isAuthenticated ? auth()->user()->clientCompanies()->select('client_companies.id', 'company_name', 'slug')->get() : collect();

      // Build Finance submenu items (authenticated only)
      $__financeItems = $__isAuthenticated ? [
        ['type' => 'link', 'label' => 'Accounts', 'href' => '/finance/accounts'],
        ['type' => 'link', 'label' => 'Transactions', 'href' => '/finance/all-transactions'],
        ['type' => 'link', 'label' => 'Tax Preview', 'href' => '/finance/tax-preview'],
        ['type' => 'link', 'label' => 'RSU', 'href' => '/finance/rsu'],
        ['type' => 'link', 'label' => 'Payslips', 'href' => '/finance/payslips'],
        ['type' => 'link', 'label' => 'Utility Bill Tracker', 'href' => '/utility-bill-tracker'],
      ] : [];

      // Build Tools submenu (admin sub-items filtered server-side)
      $__toolsItems = array_values(array_filter([
        ['type' => 'group', 'label' => 'Utilities'],
        ['type' => 'link', 'label' => 'License Manager', 'href' => '/tools/license-manager'],
        ['type' => 'link', 'label' => 'Bingo Card Generator', 'href' => '/tools/bingo'],
        ['type' => 'link', 'label' => 'Capital Loss Carryover Worksheet', 'href' => '/tools/irs-f461'],
        $__isAdmin ? ['type' => 'group', 'label' => 'Admin'] : null,
        $__isAdmin ? ['type' => 'link', 'label' => 'User Management', 'href' => '/admin/users'] : null,
        $__isAdmin ? ['type' => 'link', 'label' => 'Client Management', 'href' => '/client/mgmt'] : null,
      ]));

      // Build Client Portal submenu (only when user has companies)
      $__clientPortalItems = $__clientCompanies->count() > 0
        ? array_values(array_filter(array_merge(
            $__clientCompanies->map(fn($c) => ['type' => 'link', 'label' => $c->company_name, 'href' => '/client/portal/' . $c->slug])->toArray(),
            $__isAdmin ? [['type' => 'divider'], ['type' => 'link', 'label' => 'All Companies', 'href' => '/client/mgmt']] : []
          )))
        : [];

      // Build top-level nav items (server-side filtered)
      $__navItems = array_values(array_filter([
        ['type' => 'link', 'label' => 'Recipes', 'href' => '/recipes'],
        ['type' => 'link', 'label' => 'Projects', 'href' => '/projects'],
        $__isAuthenticated ? ['type' => 'dropdown', 'label' => 'Finance', 'items' => $__financeItems] : null,
        ['type' => 'dropdown', 'label' => 'Tools', 'items' => $__toolsItems],
        $__clientCompanies->count() > 0 ? ['type' => 'dropdown', 'label' => 'Client Portal', 'items' => $__clientPortalItems] : null,
      ]));
    @endphp
    <script id="app-initial-data" type="application/json">
      {!! json_encode([
        'appName' => config('app.name', 'Ben Herila'),
        'appUrl' => config('app.url', ''),
        'authenticated' => $__isAuthenticated,
        'isAdmin' => $__isAdmin,
        'clientCompanies' => $__clientCompanies,
        'currentUser' => auth()->user() ? [
          'id' => auth()->id(),
          'name' => auth()->user()->name,
          'email' => auth()->user()->email,
          'user_role' => auth()->user()->user_role,
          'last_login_date' => optional(auth()->user()->last_login_date)->toDateTimeString(),
        ] : null,
        'navItems' => $__navItems,
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
    @vite(['resources/css/app.css', 'resources/js/instrument.ts', 'resources/js/navbar.tsx', 'resources/js/back-to-top.tsx'])
    @stack('head')
    <script>(_=>{let a})()</script>
  </head>
  <body class="min-h-screen flex flex-col">
    <header class="site-header border-b border-gray-200 dark:border-[#3E3E3A] h-14">
      <div id="navbar"></div>
    </header>

    <main class="flex-1">
      @yield('content')
    </main>

    <footer class="border-t border-gray-200 dark:border-[#3E3E3A] py-6 text-sm text-center text-gray-600 dark:text-[#A1A09A]">
      © {{ date('Y') }} Ben Herila
      @if(auth()->check() && auth()->user()->hasRole('admin'))
        <span class="mx-2 opacity-30">·</span>
        <a href="/admin/genai-jobs" class="hover:underline underline-offset-2">GenAI Jobs</a>
        <span class="mx-1 opacity-30">·</span>
        <a href="/queue-monitor" class="hover:underline underline-offset-2">Queue Monitor</a>
      @endif
    </footer>

    <div id="back-to-top"></div>

    @stack('scripts')
  </body>
</html>
