<x-mail::message>
# Invoice {{ $invoiceNumber }}

Hi {{ $companyName }},

@if($note)
{{ $note }}

@endif
Please find invoice **{{ $invoiceNumber }}** attached as a PDF.

<x-mail::panel>
**Total:** ${{ number_format($invoiceTotal, 2) }}
@if($remainingBalance > 0)<br>
**Balance due:** ${{ number_format($remainingBalance, 2) }}
@endif
@if($dueDate)<br>
**Due:** {{ $dueDate }}
@endif
</x-mail::panel>

@if($portalUrl)
<x-mail::button :url="$portalUrl">
View &amp; Pay Online
</x-mail::button>
@endif

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
