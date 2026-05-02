<footer class="border-t border-gray-200 dark:border-[#3E3E3A] py-6 text-sm text-center text-gray-600 dark:text-[#A1A09A]">
  © {{ date('Y') }} Ben Herila
  @if(auth()->check() && auth()->user()->hasRole('admin'))
    <span class="mx-2 opacity-30">·</span>
    <a href="{{ route('admin.genai-jobs') }}" class="hover:underline underline-offset-2">GenAI Jobs</a>
    <span class="mx-1 opacity-30">·</span>
    <a href="/queue-monitor" class="hover:underline underline-offset-2">Queue Monitor</a>
  @endif
</footer>
