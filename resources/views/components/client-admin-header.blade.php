@if(auth()->check() && (auth()->id() === 1 || auth()->user()->user_role === 'Admin'))
<div class="container mx-auto px-8 pt-4 max-w-6xl">
    <div class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-4 flex justify-between items-center">
        <div>
            <a href="/client/mgmt" class="text-xs text-muted-foreground hover:text-foreground block mb-1">
                ← Manage Clients
            </a>
            <h2 class="text-lg font-semibold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                Admin: Manage clients
            </h2>
        </div>
        @if(isset($company))
        <a href="/client/mgmt/{{ $company->id }}" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4">
            Manage project
        </a>
        @endif
    </div>
</div>
@endif
