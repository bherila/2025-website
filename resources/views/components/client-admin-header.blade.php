@props(['company' => null])

@if(auth()->check() && (auth()->id() === 1 || auth()->user()->user_role === 'Admin'))
<div class="container mx-auto px-8 pt-4 max-w-6xl">
    <div class="bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 mb-4 flex justify-between items-center">
        <div>
            <a href="/client/mgmt" class="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 flex items-center gap-1">
                ← Manage Clients
            </a>
        </div>
        @if($company)
        <div class="flex items-center gap-4">
            <span class="text-xs font-bold text-slate-400 uppercase tracking-wider">Admin Mode</span>
            <a href="/client/mgmt/{{ $company->id }}" class="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4">
                Manage Company
            </a>
        </div>
        @endif
    </div>
</div>
@endif
