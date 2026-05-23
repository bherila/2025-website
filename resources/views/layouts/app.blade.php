<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    @viteReactRefresh
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', config('app.name', 'Ben Herila'))</title>
    <meta name="color-scheme" content="dark light">
    @php
      $__currentUser = auth()->user();
      $__isAuthenticated = !is_null($__currentUser);
      $__isAdmin = $__isAuthenticated && $__currentUser->hasRole('admin');
      $__clientCompanies = $__isAuthenticated ? $__currentUser->clientCompanies()->select('client_companies.id', 'company_name', 'slug')->get() : collect();

      // Build Projects submenu (public)
      $__projectItems = [
        ['type' => 'link', 'label' => 'Project Portfolio', 'href' => '/projects'],
        ['type' => 'group', 'label' => 'Games'],
        ['type' => 'link', 'label' => 'Parking Pickup', 'href' => '/games/parking-pickup'],
        ['type' => 'link', 'label' => 'Marble Sort', 'href' => '/games/marble-sort'],
        ['type' => 'link', 'label' => 'Bingo Card Generator', 'href' => '/tools/bingo'],
      ];

      // Build Finance submenu (public calculators plus authenticated account tools)
      $__financeItems = array_values(array_filter([
        $__isAuthenticated ? ['type' => 'group', 'label' => 'Accounts'] : null,
        $__isAuthenticated ? ['type' => 'link', 'label' => 'Accounts', 'href' => '/finance/accounts'] : null,
        $__isAuthenticated ? ['type' => 'link', 'label' => 'Transactions', 'href' => '/finance/all-transactions'] : null,
        $__isAuthenticated ? ['type' => 'link', 'label' => 'RSU', 'href' => '/finance/rsu'] : null,
        $__isAuthenticated ? ['type' => 'link', 'label' => 'Payslips', 'href' => '/finance/payslips'] : null,
        $__isAuthenticated ? ['type' => 'link', 'label' => 'Utility Bill Tracker', 'href' => '/utility-bill-tracker'] : null,
        ['type' => 'group', 'label' => 'Tax'],
        $__isAuthenticated ? ['type' => 'link', 'label' => 'Tax Preview', 'href' => '/finance/tax-preview'] : null,
        ['type' => 'link', 'label' => 'Capital Loss Carryover Worksheet', 'href' => '/tools/irs-f461'],
        ['type' => 'group', 'label' => 'Calculators'],
        ['type' => 'link', 'label' => 'Financial Planning Overview', 'href' => '/financial-planning'],
        ['type' => 'link', 'label' => 'Retirement Contribution Calculator', 'href' => '/financial-planning/retirement-contribution-calculator'],
        ['type' => 'link', 'label' => 'Rent vs Buy', 'href' => '/financial-planning/rent-vs-buy'],
        ['type' => 'link', 'label' => 'Roth Conversion Planner', 'href' => '/financial-planning/roth-conversion'],
      ]));

      // Build Tools submenu (authenticated sub-items filtered server-side)
      $__toolsItems = array_values(array_filter([
        ['type' => 'group', 'label' => 'Utilities'],
        $__isAuthenticated ? ['type' => 'link', 'label' => 'PHR', 'href' => '/phr'] : null,
        ['type' => 'link', 'label' => 'License Manager', 'href' => '/tools/license-manager'],
        $__isAuthenticated ? ['type' => 'link', 'label' => 'Class Action Tracker', 'href' => '/tools/class-action-tracker'] : null,
        ['type' => 'link', 'label' => 'Address Label PDF Generator', 'href' => '/tools/address-labels'],
        ['type' => 'link', 'label' => 'Markdown Renderer', 'href' => '/tools/markdown'],
      ]));

      // Build account submenu (authenticated only; admin sub-items filtered server-side)
      $__accountMenuItems = $__isAuthenticated ? array_values(array_filter([
        ['type' => 'link', 'label' => 'User Settings', 'href' => '/dashboard'],
        $__isAdmin ? ['type' => 'group', 'label' => 'Admin'] : null,
        $__isAdmin ? ['type' => 'link', 'label' => 'User Management', 'href' => '/admin/users'] : null,
        $__isAdmin ? ['type' => 'link', 'label' => 'GenAI Jobs', 'href' => '/admin/genai-jobs'] : null,
        $__isAdmin ? ['type' => 'link', 'label' => 'Tax Normalization Review', 'href' => '/admin/tax-normalization-review'] : null,
        $__isAdmin ? ['type' => 'link', 'label' => 'Client Management', 'href' => '/client/mgmt'] : null,
      ])) : [];

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
        ['type' => 'dropdown', 'label' => 'Projects', 'items' => $__projectItems],
        ['type' => 'dropdown', 'label' => 'Finance', 'items' => $__financeItems],
        ['type' => 'dropdown', 'label' => 'Tools', 'items' => $__toolsItems],
        $__clientCompanies->count() > 0 ? ['type' => 'dropdown', 'label' => 'Client Portal', 'items' => $__clientPortalItems] : null,
      ]));
    @endphp
    <script id="app-initial-data" type="application/json" @cspNonce>
      {!! json_encode([
        'appName' => config('app.name', 'Ben Herila'),
        'appUrl' => config('app.url', ''),
        'authenticated' => $__isAuthenticated,
        'isAdmin' => $__isAdmin,
        'clientCompanies' => $__clientCompanies,
        'currentUser' => $__currentUser ? [
          'id' => $__currentUser->id,
          'name' => $__currentUser->name,
          'email' => $__currentUser->email,
          'user_role' => $__currentUser->user_role,
          'last_login_date' => optional($__currentUser->last_login_date)->toDateTimeString(),
        ] : null,
        'navItems' => $__navItems,
        'accountMenuItems' => $__accountMenuItems,
      ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
    @stack('data-head')
    <script @cspNonce>
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
    <script @cspNonce>(_=>{let a})()</script>
  </head>
  <body class="min-h-screen flex flex-col">
    <header class="site-header border-b border-gray-200 dark:border-[#3E3E3A] h-14">
      <div id="navbar"></div>
    </header>

    <main class="flex-1">
      @yield('content')
    </main>

    @include('layouts.footer')

    <div id="back-to-top"></div>

    @stack('scripts')
  </body>
</html>
