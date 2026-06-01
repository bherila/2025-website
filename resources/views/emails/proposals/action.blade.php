<x-mail::message>
# Proposal {{ $action === 'changes_requested' ? 'Changes Requested' : ucfirst($action) }}

**{{ $companyName }}** has {{ $action === 'changes_requested' ? 'requested changes on' : $action }} the proposal **{{ $title }}** (v{{ $version }}).

@if($responderName)
By: {{ $responderName }}@if($responderTitle), {{ $responderTitle }}@endif
@endif

@if($action === 'accepted')
@unless(is_null($acceptedNet))
**Upfront total:** ${{ number_format((float) $acceptedNet, 2) }}
@endunless

@if(count($selectedItems) > 0)
**Selected items**
@foreach($selectedItems as $item)
- {{ $item['description'] }}@unless(is_null($item['amount'])) — ${{ number_format((float) $item['amount'], 2) }}@endunless
@endforeach
@endif
@endif

@if($clientResponse)
**Client message**

> {{ $clientResponse }}
@endif

<x-mail::button :url="$url">
View Proposal
</x-mail::button>

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
